import { Hono } from "hono";
import {
  getDb,
  scopeToHousehold,
  recurringTransactions,
  groceryItems,
  transactions,
  eq,
  and,
  gte,
  lte,
  isNull,
  isNotNull,
} from "@amigo/db";
import type { HonoEnv } from "../env";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { parseCalendarQuery } from "../lib/request-validation";

export interface CalendarEvent {
  id: string;
  type: "recurring" | "grocery_purchase" | "transaction";
  date: string; // ISO 8601 YYYY-MM-DD or timestamp ms
  title: string;
  subtitle?: string;
  color: "green" | "red" | "orange" | "blue";
  metadata?: {
    amount?: number; // cents
    currency?: string;
    transactionType?: "income" | "expense";
    frequency?: string;
    itemCount?: number;
  };
}

interface RecurringRule {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  currency: string;
  type: "income" | "expense";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  lastRunDate: string | null;
  active: boolean;
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
  rule: RecurringRule,
  monthStart: Date,
  monthEnd: Date
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  if (!rule.active) return events;

  let current = new Date(rule.startDate + "T00:00:00Z");

  // Advance to month range
  while (current < monthStart) {
    current = calculateNextRunDate(rule.frequency, rule.interval, current);
  }

  const nextRun = new Date(rule.nextRunDate + "T00:00:00Z");

  while (current <= monthEnd) {
    if (rule.endDate && current > new Date(rule.endDate + "T00:00:00Z")) break;

    // Only show future occurrences (past ones already created transactions)
    if (current >= nextRun) {
      const dateStr = current.toISOString().split("T")[0]!;
      events.push({
        id: `recurring-${rule.id}-${dateStr}`,
        type: "recurring",
        date: dateStr,
        title: rule.description || rule.category,
        subtitle: rule.description ? rule.category : undefined,
        color: rule.type === "income" ? "green" : "red",
        metadata: {
          amount: rule.amount,
          currency: rule.currency,
          transactionType: rule.type,
          frequency: rule.frequency,
        },
      });
    }

    current = calculateNextRunDate(rule.frequency, rule.interval, current);
  }

  return events;
}

export const calendarRoute = new Hono<HonoEnv>().get("/", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `calendar:${session.userId}`,
    ROUTE_RATE_LIMITS.calendar.list
  );

  const parsedQuery = parseCalendarQuery({
    year: c.req.query("year"),
    month: c.req.query("month"),
  });
  const year = parsedQuery.year;
  const month = parsedQuery.month - 1; // Convert 1-indexed API param to 0-indexed for JS Date

  // Calculate month boundaries as ISO date strings
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0)); // Last day
  const startStr = monthStart.toISOString().split("T")[0]!;
  const endStr = monthEnd.toISOString().split("T")[0]!;

  // Timestamp boundaries for purchasedAt (integer ms)
  const startMs = monthStart.getTime();
  const endMs = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)).getTime();

  const db = getDb(c.env.DB);
  const householdScope = scopeToHousehold(recurringTransactions.householdId, session.householdId);

  const [rules, purchasedGroceries, monthTransactions] = await Promise.all([
    // Active recurring rules for this user
    db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          householdScope,
          eq(recurringTransactions.userId, session.userId)
        )
      )
      .all(),

    // Groceries purchased during this month (household-wide)
    db
      .select()
      .from(groceryItems)
      .where(
        and(
          scopeToHousehold(groceryItems.householdId, session.householdId),
          eq(groceryItems.isPurchased, true),
          isNotNull(groceryItems.purchasedAt),
          gte(groceryItems.purchasedAt, new Date(startMs)),
          lte(groceryItems.purchasedAt, new Date(endMs)),
          isNull(groceryItems.deletedAt)
        )
      )
      .all(),

    // Transactions for this month (user-specific)
    db
      .select()
      .from(transactions)
      .where(
        and(
          scopeToHousehold(transactions.householdId, session.householdId),
          eq(transactions.userId, session.userId),
          gte(transactions.date, startStr),
          lte(transactions.date, endStr),
          isNull(transactions.deletedAt)
        )
      )
      .all(),
  ]);

  const events: CalendarEvent[] = [];

  // Add recurring rule occurrences
  for (const rule of rules) {
    const occurrences = getRecurringOccurrences(
      rule as RecurringRule,
      monthStart,
      monthEnd
    );
    events.push(...occurrences);
  }

  // Add grocery purchase events
  for (const item of purchasedGroceries) {
    if (!item.purchasedAt) continue;
    events.push({
      id: `grocery-${item.id}`,
      type: "grocery_purchase",
      date: item.purchasedAt.getTime().toString(), // timestamp ms for client TZ handling
      title: item.itemName,
      color: "orange",
      metadata: { itemCount: 1 },
    });
  }

  // Add transaction events
  for (const tx of monthTransactions) {
    events.push({
      id: `transaction-${tx.id}`,
      type: "transaction",
      date: tx.date,
      title: tx.description || tx.category,
      subtitle: tx.description ? tx.category : undefined,
      color: tx.type === "income" ? "green" : "blue",
      metadata: {
        amount: tx.amount,
        currency: tx.currency,
        transactionType: tx.type as "income" | "expense",
      },
    });
  }

  // Return recurring rules too for client-side preview calculations
  const recurringRules = rules.map((r) => ({
    id: r.id,
    category: r.category,
    description: r.description,
    amount: r.amount,
    type: r.type,
    frequency: r.frequency,
    interval: r.interval,
    startDate: r.startDate,
    endDate: r.endDate,
    nextRunDate: r.nextRunDate,
    active: r.active,
  }));

  return c.json({ events, recurringRules });
});
