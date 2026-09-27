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
import { visibleFinancialTransactionsCondition, visibleRecurringRulesCondition } from "../lib/financial-visibility";
import { calculateNextRunDate } from "../lib/recurring-processor";
import {
  endOfIsoDayInTz,
  startOfIsoDayInTz,
  toISODateInTz,
} from "../lib/dates";
import { getHouseholdTimezone } from "../lib/household-timezone";
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
  dayOfMonth: number | null;
  active: boolean;
}

const MAX_RECURRING_CALENDAR_STEPS = 500;

export function getRecurringOccurrences(
  rule: RecurringRule,
  monthStart: Date,
  monthEnd: Date
) {
  const events: CalendarEvent[] = [];
  if (!rule.active) return events;

  const startDate = new Date(`${rule.startDate}T00:00:00Z`);
  const nextRun = new Date(`${rule.nextRunDate}T00:00:00Z`);
  let current = nextRun > startDate ? nextRun : startDate;
  let steps = 0;

  while (current < monthStart) {
    if (steps++ >= MAX_RECURRING_CALENDAR_STEPS) {
      return events;
    }
    current = calculateNextRunDate(
      rule.frequency,
      rule.interval,
      current,
      rule.dayOfMonth
    );
  }

  while (current <= monthEnd) {
    if (steps++ >= MAX_RECURRING_CALENDAR_STEPS) {
      break;
    }
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

    current = calculateNextRunDate(
      rule.frequency,
      rule.interval,
      current,
      rule.dayOfMonth
    );
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
      env,
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

  const db = getDb(env.DB);
  // Grocery purchases are instants; bound and date them in the household's
  // timezone so they land on the same day as on the dashboard.
  const timeZone = await getHouseholdTimezone(db, session!.householdId);
  const monthStartInstant = startOfIsoDayInTz(startStr, timeZone);
  const monthEndInstant = endOfIsoDayInTz(endStr, timeZone);
  const householdScope = scopeToHousehold(
    recurringTransactions.householdId,
    session!.householdId
  );

  const [rules, purchasedGroceries, monthTransactions] = await Promise.all([
    db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          householdScope,
          visibleRecurringRulesCondition(session!.userId),
          isNull(recurringTransactions.deletedAt)
        )
      )
      .all(),
    db
      .select()
      .from(groceryItems)
      .where(
        and(
          scopeToHousehold(groceryItems.householdId, session!.householdId),
          eq(groceryItems.isPurchased, true),
          isNotNull(groceryItems.purchasedAt),
          gte(groceryItems.purchasedAt, monthStartInstant),
          lte(groceryItems.purchasedAt, monthEndInstant),
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
          visibleFinancialTransactionsCondition(session!.userId),
          gte(transactions.date, startStr),
          lte(transactions.date, endStr),
          isNull(transactions.deletedAt)
        )
      )
      .all(),
  ]);

  const recurringRules: RecurringRule[] = rules.map((rule) => ({
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
    dayOfMonth: rule.dayOfMonth,
    active: rule.active,
  }));

  const events: CalendarEvent[] = [];

  for (const rule of recurringRules) {
    events.push(...getRecurringOccurrences(rule, monthStart, monthEnd));
  }

  for (const item of purchasedGroceries) {
    if (!item.purchasedAt) continue;

    events.push({
      id: `grocery-${item.id}`,
      type: "grocery_purchase",
      date: toISODateInTz(item.purchasedAt, timeZone),
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

  return Response.json({ events, recurringRules });
};
