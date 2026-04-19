import {
  and,
  eq,
  getDb,
  groceryItems,
  gte,
  isNotNull,
  isNull,
  lte,
  recurringTransactions,
  scopeToHousehold,
  transactions,
} from "@amigo/db";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { parseCalendarQuery } from "../lib/request-validation";
import type { ApiHandler } from "./route";

export interface CalendarEvent {
  id: string;
  type: "recurring" | "grocery_purchase" | "transaction";
  date: string;
  title: string;
  subtitle?: string;
  color: "green" | "red" | "orange" | "blue";
  metadata?: {
    amount?: number;
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
) {
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
) {
  const events: CalendarEvent[] = [];
  if (!rule.active) return events;

  let current = new Date(`${rule.startDate}T00:00:00Z`);

  while (current < monthStart) {
    current = calculateNextRunDate(rule.frequency, rule.interval, current);
  }

  const nextRun = new Date(`${rule.nextRunDate}T00:00:00Z`);

  while (current <= monthEnd) {
    if (rule.endDate && current > new Date(`${rule.endDate}T00:00:00Z`)) {
      break;
    }

    if (current >= nextRun) {
      const date = current.toISOString().split("T")[0]!;
      events.push({
        id: `recurring-${rule.id}-${date}`,
        type: "recurring",
        date,
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

export const handleCalendarRequest: ApiHandler = async ({
  env,
  request,
  session,
}) => {
  if (request.method !== "GET") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  await enforceRateLimit(
    env.CACHE,
    `calendar:${session!.userId}`,
    ROUTE_RATE_LIMITS.calendar.list
  );

  const url = new URL(request.url);
  const parsedQuery = parseCalendarQuery({
    year: url.searchParams.get("year") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
  });
  const year = parsedQuery.year;
  const month = parsedQuery.month - 1;

  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  const startStr = monthStart.toISOString().split("T")[0]!;
  const endStr = monthEnd.toISOString().split("T")[0]!;
  const startMs = monthStart.getTime();
  const endMs = new Date(
    Date.UTC(year, month + 1, 0, 23, 59, 59, 999)
  ).getTime();

  const db = getDb(env.DB);
  const householdScope = scopeToHousehold(
    recurringTransactions.householdId,
    session!.householdId
  );

  const [rules, purchasedGroceries, monthTransactions] = await Promise.all([
    db
      .select()
      .from(recurringTransactions)
      .where(and(householdScope, eq(recurringTransactions.userId, session!.userId)))
      .all(),
    db
      .select()
      .from(groceryItems)
      .where(
        and(
          scopeToHousehold(groceryItems.householdId, session!.householdId),
          eq(groceryItems.isPurchased, true),
          isNotNull(groceryItems.purchasedAt),
          gte(groceryItems.purchasedAt, new Date(startMs)),
          lte(groceryItems.purchasedAt, new Date(endMs)),
          isNull(groceryItems.deletedAt)
        )
      )
      .all(),
    db
      .select()
      .from(transactions)
      .where(
        and(
          scopeToHousehold(transactions.householdId, session!.householdId),
          eq(transactions.userId, session!.userId),
          gte(transactions.date, startStr),
          lte(transactions.date, endStr),
          isNull(transactions.deletedAt)
        )
      )
      .all(),
  ]);

  const events: CalendarEvent[] = [];

  for (const rule of rules) {
    events.push(
      ...getRecurringOccurrences(rule as RecurringRule, monthStart, monthEnd)
    );
  }

  for (const item of purchasedGroceries) {
    if (!item.purchasedAt) continue;

    events.push({
      id: `grocery-${item.id}`,
      type: "grocery_purchase",
      date: item.purchasedAt.toISOString().split("T")[0]!,
      title: item.itemName,
      color: "orange",
      metadata: { itemCount: 1 },
    });
  }

  for (const transaction of monthTransactions) {
    events.push({
      id: `transaction-${transaction.id}`,
      type: "transaction",
      date: transaction.date,
      title: transaction.description || transaction.category,
      subtitle: transaction.description ? transaction.category : undefined,
      color: transaction.type === "income" ? "green" : "blue",
      metadata: {
        amount: transaction.amount,
        currency: transaction.currency,
        transactionType: transaction.type as "income" | "expense",
      },
    });
  }

  const recurringRules = rules.map((rule) => ({
    id: rule.id,
    category: rule.category,
    description: rule.description,
    amount: rule.amount,
    currency: rule.currency,
    type: rule.type,
    frequency: rule.frequency,
    interval: rule.interval,
    startDate: rule.startDate,
    endDate: rule.endDate,
    nextRunDate: rule.nextRunDate,
    lastRunDate: rule.lastRunDate,
    active: rule.active,
  }));

  return Response.json({ events, recurringRules });
};
