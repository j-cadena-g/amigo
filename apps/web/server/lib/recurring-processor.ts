import {
  and,
  eq,
  households,
  inArray,
  lte,
  recurringTransactions,
  scopeToHousehold,
  transactions,
} from "@amigo/db";
import type { DrizzleD1 } from "@amigo/db";
import { toISODate } from "./conversions";
import { todayInTz } from "./dates";
import { getExchangeRateForRecord } from "./exchange-rates";
import { getHomeCurrency } from "./household-currency";
import { broadcastToHousehold } from "./realtime";
import type { Env } from "../env";

export type RecurringFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type RecurringRule = typeof recurringTransactions.$inferSelect;

export function calculateNextRunDate(
  frequency: RecurringFrequency,
  interval: number,
  fromDate: Date,
  dayOfMonth?: number | null
) {
  const next = new Date(fromDate);
  switch (frequency) {
    case "DAILY":
      next.setUTCDate(next.getUTCDate() + interval);
      break;
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + interval * 7);
      break;
    case "MONTHLY": {
      const desiredDay = dayOfMonth ?? next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + interval);
      const lastDay = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
      ).getUTCDate();
      next.setUTCDate(Math.min(desiredDay, lastDay));
      break;
    }
    case "YEARLY":
      next.setUTCFullYear(next.getUTCFullYear() + interval);
      break;
  }
  return next;
}

export function getInitialNextRunDate(
  startDate: Date,
  frequency: RecurringFrequency,
  interval: number,
  dayOfMonth?: number | null,
  endDate?: Date | null
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = endDate ? new Date(endDate) : null;
  if (end) end.setUTCHours(0, 0, 0, 0);

  if (!Number.isFinite(interval) || interval <= 0) {
    throw new TypeError(
      `Invalid recurring interval: expected a positive finite number, got ${String(interval)}`
    );
  }

  if (start > today) {
    if (end && start > end) return null;
    return start;
  }

  let nextRun = new Date(start);

  if (nextRun < today) {
    if (frequency === "DAILY") {
      const msPerDay = 86_400_000;
      const daysDiff = Math.floor((today.getTime() - nextRun.getTime()) / msPerDay);
      if (daysDiff > 0) {
        const skips = Math.ceil(daysDiff / interval);
        nextRun = calculateNextRunDate("DAILY", skips * interval, nextRun, dayOfMonth);
      }
    } else if (frequency === "WEEKLY") {
      const msPerDay = 86_400_000;
      const daysDiff = Math.floor((today.getTime() - nextRun.getTime()) / msPerDay);
      const spanDays = 7 * interval;
      if (daysDiff > 0) {
        const skips = Math.ceil(daysDiff / spanDays);
        nextRun = calculateNextRunDate("WEEKLY", skips * interval, nextRun, dayOfMonth);
      }
    } else {
      let safety = 0;
      while (nextRun < today && safety < 10_000) {
        nextRun = calculateNextRunDate(frequency, interval, nextRun, dayOfMonth);
        safety++;
      }
    }
  }

  let guard = 0;
  while (nextRun < today && guard < 400) {
    nextRun = calculateNextRunDate(frequency, interval, nextRun, dayOfMonth);
    guard++;
  }

  if (end && nextRun > end) return null;
  return nextRun;
}

export function buildRecurringOccurrenceTransactionId(ruleId: string, runDate: string) {
  return `recurring:${ruleId}:${runDate}`;
}

export function isSqlitePrimaryKeyConflict(error: unknown) {
  return (
    error instanceof Error &&
    /(?:UNIQUE constraint failed: transactions\.id|PRIMARY KEY constraint failed: transactions\.id)/i.test(
      error.message
    )
  );
}

export async function advanceRecurringRuleIfCurrent(db: DrizzleD1, rule: RecurringRule) {
  const nextRunDate = calculateNextRunDate(
    rule.frequency,
    rule.interval,
    new Date(rule.nextRunDate),
    rule.dayOfMonth
  );

  const endDate = rule.endDate ? new Date(rule.endDate) : null;
  if (endDate) endDate.setUTCHours(0, 0, 0, 0);

  const update =
    endDate && nextRunDate > endDate
      ? { lastRunDate: rule.nextRunDate, active: false }
      : {
          lastRunDate: rule.nextRunDate,
          nextRunDate: toISODate(nextRunDate),
        };

  return await db
    .update(recurringTransactions)
    .set(update)
    .where(
      and(
        eq(recurringTransactions.id, rule.id),
        eq(recurringTransactions.active, true),
        eq(recurringTransactions.nextRunDate, rule.nextRunDate)
      )
    )
    .returning({ id: recurringTransactions.id })
    .get();
}

export type ProcessDueRecurringMode =
  | { mode: "household_user"; householdId: string; userId: string }
  | { mode: "all_households" };

/**
 * Posts due recurring transactions (idempotent by deterministic transaction id)
 * and advances matching rules. Used by the manual API and the Worker cron.
 */
export async function processDueRecurringRules(
  env: Env,
  db: DrizzleD1,
  scope: ProcessDueRecurringMode
): Promise<{ processed: number }> {
  const now = new Date();
  const farthestToday = todayInTz("Pacific/Kiritimati", now);

  const conditions = [
    eq(recurringTransactions.active, true),
    lte(recurringTransactions.nextRunDate, farthestToday),
  ];

  if (scope.mode === "household_user") {
    conditions.push(
      scopeToHousehold(recurringTransactions.householdId, scope.householdId),
      eq(recurringTransactions.userId, scope.userId)
    );
  }

  const candidateRules = await db.query.recurringTransactions.findMany({
    where: and(...conditions),
  });

  const householdIds = [...new Set(candidateRules.map((r) => r.householdId))];
  const timezoneByHousehold = new Map<string, string>();
  if (householdIds.length > 0) {
    const rows = await db
      .select({ id: households.id, timezone: households.timezone })
      .from(households)
      .where(inArray(households.id, householdIds));
    for (const row of rows) {
      timezoneByHousehold.set(row.id, row.timezone ?? "UTC");
    }
  }

  const dueRules = candidateRules.filter((rule) => {
    const tz = timezoneByHousehold.get(rule.householdId) ?? "UTC";
    const localToday = todayInTz(tz, now);
    return rule.nextRunDate <= localToday;
  });

  if (dueRules.length === 0) {
    return { processed: 0 };
  }

  let processedCount = 0;
  const countsByHousehold = new Map<string, number>();

  for (const rule of dueRules) {
    const transactionId = buildRecurringOccurrenceTransactionId(rule.id, rule.nextRunDate);
    let inserted = false;

    try {
      const homeCurrency = await getHomeCurrency(db, rule.householdId);
      const exchangeRateToHome = await getExchangeRateForRecord(
        env,
        rule.currency,
        homeCurrency
      );

      await db.insert(transactions).values({
        id: transactionId,
        householdId: rule.householdId,
        userId: rule.userId,
        amount: rule.amount,
        currency: rule.currency,
        exchangeRateToHome,
        categoryId: rule.categoryId,
        category: rule.category,
        description: rule.description,
        type: rule.type,
        date: rule.nextRunDate,
        budgetId: rule.budgetId,
      });

      inserted = true;
    } catch (error) {
      if (!isSqlitePrimaryKeyConflict(error)) {
        throw error;
      }
    }

    if (inserted) {
      processedCount++;
      countsByHousehold.set(
        rule.householdId,
        (countsByHousehold.get(rule.householdId) ?? 0) + 1
      );
    }

    await advanceRecurringRuleIfCurrent(db, rule);
  }

  for (const [householdId, count] of countsByHousehold) {
    await broadcastToHousehold(env, householdId, {
      type: "TRANSACTION_UPDATE",
      action: "batch_create",
      count,
    });
  }

  return { processed: processedCount };
}
