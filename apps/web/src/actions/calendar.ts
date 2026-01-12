"use server";

import { db, eq, and, isNull, gte, lte, isNotNull } from "@amigo/db";
import { recurringTransactions, groceryItems, transactions } from "@amigo/db/schema";
import { getSession } from "@/lib/session";

/**
 * Normalize a date-only value from Postgres.
 * Drizzle returns `date` columns as Date objects at midnight UTC.
 * When TZ is set, this can shift the date incorrectly.
 * This function extracts the UTC date components and creates a local date.
 */
function normalizeDateOnly(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface CalendarEvent {
  id: string;
  type: "recurring" | "grocery_purchase" | "transaction";
  date: Date;
  title: string;
  subtitle?: string;
  color: "green" | "red" | "orange" | "blue";
  metadata?: {
    amount?: string;
    transactionType?: "income" | "expense";
    frequency?: string;
    itemCount?: number;
  };
}

export interface CalendarEventsResult {
  events: CalendarEvent[];
  recurringRules: Array<{
    id: string;
    category: string;
    description: string | null;
    amount: string;
    type: "income" | "expense";
    frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    interval: number;
    startDate: Date;
    endDate: Date | null;
    nextRunDate: Date;
    active: boolean;
  }>;
}

function calculateNextRunDate(
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
  interval: number,
  fromDate: Date
): Date {
  const next = new Date(fromDate);

  switch (frequency) {
    case "DAILY":
      next.setDate(next.getDate() + interval);
      break;
    case "WEEKLY":
      next.setDate(next.getDate() + interval * 7);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + interval);
      break;
    case "YEARLY":
      next.setFullYear(next.getFullYear() + interval);
      break;
  }

  return next;
}

function getRecurringOccurrences(
  rule: {
    id: string;
    category: string;
    description: string | null;
    amount: string;
    type: "income" | "expense";
    frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    interval: number;
    startDate: Date;
    endDate: Date | null;
    nextRunDate: Date;
    lastRunDate: Date | null;
    active: boolean;
  },
  monthStart: Date,
  monthEnd: Date
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // Start from either the rule's start date or the month start, whichever is later
  let current = new Date(rule.startDate);
  current.setHours(0, 0, 0, 0);

  // Find first occurrence within or before our range
  while (current < monthStart) {
    current = calculateNextRunDate(rule.frequency, rule.interval, current);
  }

  // For active rules, only show future projections (nextRunDate and beyond)
  // For inactive rules (completed), don't show any projections
  // Past occurrences are already represented as transactions
  const nextRun = new Date(rule.nextRunDate);
  nextRun.setHours(0, 0, 0, 0);

  // Generate all occurrences within the month range
  while (current <= monthEnd) {
    // Check if we've passed the end date
    if (rule.endDate && current > rule.endDate) {
      break;
    }

    // Only show future occurrences (from nextRunDate onwards)
    // Past occurrences already created transactions
    if (rule.active && current >= nextRun) {
      events.push({
        id: `recurring-${rule.id}-${current.toISOString()}`,
        type: "recurring",
        date: new Date(current),
        title: rule.description || rule.category,
        subtitle: rule.description ? rule.category : undefined,
        color: rule.type === "income" ? "green" : "red",
        metadata: {
          amount: rule.amount,
          transactionType: rule.type,
          frequency: rule.frequency,
        },
      });
    }

    current = calculateNextRunDate(rule.frequency, rule.interval, current);
  }

  return events;
}

export async function getCalendarEvents(
  year: number,
  month: number
): Promise<CalendarEventsResult> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  // Calculate the start and end of the month
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0); // Last day of month

  // Fetch all data in parallel
  const [recurringRules, purchasedGroceries, monthTransactions] = await Promise.all([
    // Get all active recurring rules for this user
    db.query.recurringTransactions.findMany({
      where: and(
        eq(recurringTransactions.householdId, session.householdId),
        eq(recurringTransactions.userId, session.userId)
      ),
    }),

    // Get groceries purchased during this month (household-wide)
    db.query.groceryItems.findMany({
      where: and(
        eq(groceryItems.householdId, session.householdId),
        eq(groceryItems.isPurchased, true),
        isNotNull(groceryItems.purchasedAt),
        gte(groceryItems.purchasedAt, monthStart),
        lte(groceryItems.purchasedAt, monthEnd),
        isNull(groceryItems.deletedAt)
      ),
    }),

    // Get transactions for this month (user-specific)
    db.query.transactions.findMany({
      where: and(
        eq(transactions.householdId, session.householdId),
        eq(transactions.userId, session.userId),
        gte(transactions.date, monthStart),
        lte(transactions.date, monthEnd),
        isNull(transactions.deletedAt)
      ),
    }),
  ]);

  const events: CalendarEvent[] = [];

  // Add recurring rule occurrences
  // Normalize date-only fields from Postgres to avoid TZ shift issues
  for (const rule of recurringRules) {
    const normalizedRule = {
      ...rule,
      startDate: normalizeDateOnly(rule.startDate),
      endDate: rule.endDate ? normalizeDateOnly(rule.endDate) : null,
      nextRunDate: normalizeDateOnly(rule.nextRunDate),
      lastRunDate: rule.lastRunDate ? normalizeDateOnly(rule.lastRunDate) : null,
    };
    const occurrences = getRecurringOccurrences(normalizedRule, monthStart, monthEnd);
    events.push(...occurrences);
  }

  // Add grocery purchase events
  // Send each purchase with its full timestamp - the client will group by local date
  for (const item of purchasedGroceries) {
    if (!item.purchasedAt) continue;
    events.push({
      id: `grocery-${item.id}`,
      type: "grocery_purchase",
      date: item.purchasedAt, // Full timestamp, client handles timezone display
      title: item.itemName,
      color: "orange",
      metadata: {
        itemCount: 1,
      },
    });
  }

  // Add transactions
  // Normalize date-only fields from Postgres to avoid TZ shift issues
  for (const tx of monthTransactions) {
    events.push({
      id: `transaction-${tx.id}`,
      type: "transaction",
      date: normalizeDateOnly(tx.date),
      title: tx.description || tx.category,
      subtitle: tx.description ? tx.category : undefined,
      color: tx.type === "income" ? "green" : "blue",
      metadata: {
        amount: tx.amount,
        transactionType: tx.type,
      },
    });
  }

  return {
    events,
    recurringRules: recurringRules.map((r) => ({
      id: r.id,
      category: r.category,
      description: r.description,
      amount: r.amount,
      type: r.type,
      frequency: r.frequency,
      interval: r.interval,
      startDate: normalizeDateOnly(r.startDate),
      endDate: r.endDate ? normalizeDateOnly(r.endDate) : null,
      nextRunDate: normalizeDateOnly(r.nextRunDate),
      active: r.active,
    })),
  };
}
