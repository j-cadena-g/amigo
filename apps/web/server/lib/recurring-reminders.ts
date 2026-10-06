import {
  and,
  eq,
  getDb,
  households,
  isNull,
  lt,
  lte,
  pushSubscriptions,
  recurringReminderDeliveries,
  recurringTransactions,
  scopeToHousehold,
  sql,
  users,
  type DrizzleD1,
  type UiLanguage,
} from "@amigo/db";
import { localReminderTimeToUtc, ReminderTimeError } from "@/app/lib/reminder-times";
import type { Env } from "../env";
import { isValidIsoDateString, todayInTz } from "./dates";
import { calculateNextRunDate, type RecurringRule } from "./recurring-processor";
import { transactionReminderTtl } from "./transaction-reminders";
import {
  ensureVapidConfigured,
  recipientLanguage,
  sendPushNotification,
  type NotificationPayload,
} from "./push/sender";

const LEASE_MS = 5 * 60_000;
const LATENESS_MS = 3 * 60 * 60_000;
const WALL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export interface DueRecurringReminder {
  occurrenceDate: string;
  reminderAt: string;
}

function addIsoDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Match the original occurrence series, independent of the posting job's nextRunDate. */
export function occursOnDate(rule: RecurringRule, date: string): boolean {
  if (
    !rule.active ||
    rule.deletedAt ||
    !isValidIsoDateString(date) ||
    !isValidIsoDateString(rule.startDate) ||
    rule.startDate > date ||
    (rule.endDate && rule.endDate < date) ||
    !Number.isInteger(rule.interval) ||
    rule.interval <= 0
  )
    return false;
  let next = new Date(`${rule.startDate}T00:00:00.000Z`);
  const target = new Date(`${date}T00:00:00.000Z`);
  if (rule.frequency === "DAILY" || rule.frequency === "WEEKLY") {
    const span = rule.interval * (rule.frequency === "WEEKLY" ? 7 : 1);
    const days = (target.getTime() - next.getTime()) / 86_400_000;
    return days % span === 0;
  }
  // Use exactly the posting processor's month clipping and leap-year advancement.
  // This is bounded to the complete four-digit-year calendar range.
  for (let i = 0; next < target && i < 120_000; i++) {
    next = calculateNextRunDate(rule.frequency, rule.interval, next, rule.dayOfMonth);
  }
  return next.getTime() === target.getTime();
}

/** Repeated wall times choose the earlier instant; gaps move to the first valid minute. */
export function recurringReminderTimeToUtc(
  localDate: string,
  time: string,
  timezone: string
): string | null {
  if (!isValidIsoDateString(localDate) || !WALL_TIME.test(time)) return null;
  const nominal = new Date(`${localDate}T${time}:00.000Z`);
  for (let minutes = 0; minutes <= 180; minutes++) {
    const wall = new Date(nominal.getTime() + minutes * 60_000).toISOString().slice(0, 16);
    try {
      return localReminderTimeToUtc(wall, timezone);
    } catch (error) {
      if (!(error instanceof ReminderTimeError)) throw error;
    }
  }
  return null;
}

/** Only two local days can intersect a three-hour delivery window. */
export function dueRecurringReminders(
  rule: RecurringRule,
  timezone: string,
  now: Date
): DueRecurringReminder[] {
  const localDays = new Set([
    todayInTz(timezone, now),
    todayInTz(timezone, new Date(now.getTime() - LATENESS_MS)),
  ]);
  const due = new Map<string, DueRecurringReminder>();
  for (const schedule of rule.reminderSchedules) {
    if (
      !Number.isInteger(schedule.dayOffset) ||
      Math.abs(schedule.dayOffset) > 36_600 ||
      !WALL_TIME.test(schedule.time)
    )
      continue;
    for (const localDate of localDays) {
      const occurrenceDate = addIsoDays(localDate, -schedule.dayOffset);
      if (!occursOnDate(rule, occurrenceDate)) continue;
      const reminderAt = recurringReminderTimeToUtc(localDate, schedule.time, timezone);
      if (reminderAt && transactionReminderTtl(reminderAt, now) !== null) {
        due.set(JSON.stringify([occurrenceDate, reminderAt]), { occurrenceDate, reminderAt });
      }
    }
  }
  return [...due.values()];
}

export function buildRecurringReminderPayload(
  rule: Pick<RecurringRule, "id" | "description" | "category">,
  reminder: DueRecurringReminder,
  language: UiLanguage
): NotificationPayload {
  const label = rule.description?.trim() || rule.category;
  return {
    title:
      language === "es"
        ? "Recordatorio de transacción recurrente"
        : "Recurring transaction reminder",
    body: language === "es" ? `Recordatorio: ${label}` : `Reminder: ${label}`,
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    tag: `recurring-reminder:${JSON.stringify([rule.id, reminder.occurrenceDate, reminder.reminderAt])}`,
    data: { url: "/financial/recurring", type: "recurring-reminder" },
  };
}

/** One atomic statement prevents concurrent jobs claiming the same occurrence/device/time. */
export async function claimReminderDelivery(
  db: DrizzleD1,
  subscriptionId: string,
  ruleId: string,
  occurrenceDate: string,
  reminderAt: string,
  now: Date
) {
  const id = `recurring-reminder:${JSON.stringify([ruleId, occurrenceDate, reminderAt, subscriptionId])}`;
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const claimed = await db
    .insert(recurringReminderDeliveries)
    .values({ id, subscriptionId, reminderDate: occurrenceDate, leaseUntil, createdAt: now })
    .onConflictDoUpdate({
      target: recurringReminderDeliveries.id,
      set: { leaseUntil },
      setWhere: and(
        isNull(recurringReminderDeliveries.deliveredAt),
        lte(recurringReminderDeliveries.leaseUntil, now)
      ),
    })
    .returning({ id: recurringReminderDeliveries.id })
    .get();
  return claimed ? { id, leaseUntil } : null;
}

/** Explicit per-rule reminders go only to that rule's current owner and their devices. */
export async function processRecurringReminders(env: Env, clock: () => Date = () => new Date()) {
  const result = { sent: 0, failed: 0 };
  if (!ensureVapidConfigured(env)) return result;
  const db = getDb(env.DB);
  const recipients = await db
    .select({
      userId: users.id,
      householdId: users.householdId,
      timezone: households.timezone,
      subscriptionId: pushSubscriptions.id,
    })
    .from(users)
    .innerJoin(households, eq(households.id, users.householdId))
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id))
    .where(and(eq(users.recurringNotifications, true), isNull(users.deletedAt)));

  for (const recipient of recipients) {
    const rules = await db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          scopeToHousehold(recurringTransactions.householdId, recipient.householdId),
          eq(recurringTransactions.userId, recipient.userId),
          eq(recurringTransactions.active, true),
          isNull(recurringTransactions.deletedAt),
          sql`json_array_length(${recurringTransactions.reminderSchedules}) > 0`
        )
      );
    for (const rule of rules) {
      const candidates = dueRecurringReminders(rule, recipient.timezone ?? "UTC", clock());
      for (const reminder of candidates) {
        try {
          const loadLive = () =>
            db
              .select({
                rule: recurringTransactions,
                timezone: households.timezone,
                locale: users.locale,
                language: users.language,
                homeCurrency: households.homeCurrency,
                subscription: pushSubscriptions,
              })
              .from(recurringTransactions)
              .innerJoin(users, eq(users.id, recurringTransactions.userId))
              .innerJoin(households, eq(households.id, users.householdId))
              .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id))
              .where(
                and(
                  scopeToHousehold(recurringTransactions.householdId, recipient.householdId),
                  scopeToHousehold(users.householdId, recipient.householdId),
                  eq(recurringTransactions.id, rule.id),
                  eq(recurringTransactions.userId, recipient.userId),
                  eq(recurringTransactions.active, true),
                  isNull(recurringTransactions.deletedAt),
                  isNull(users.deletedAt),
                  eq(users.recurringNotifications, true),
                  eq(pushSubscriptions.id, recipient.subscriptionId)
                )
              )
              .get();
          const stillDue = (live: NonNullable<Awaited<ReturnType<typeof loadLive>>>) =>
            dueRecurringReminders(live.rule, live.timezone ?? "UTC", clock()).some(
              (current) =>
                current.occurrenceDate === reminder.occurrenceDate &&
                current.reminderAt === reminder.reminderAt
            );
          let live = await loadLive();
          if (!live || !stillDue(live)) continue;
          const claim = await claimReminderDelivery(
            db,
            live.subscription.id,
            rule.id,
            reminder.occurrenceDate,
            reminder.reminderAt,
            clock()
          );
          if (!claim) continue;
          live = await loadLive();
          if (!live || !stillDue(live)) continue;
          const ttl = transactionReminderTtl(reminder.reminderAt, clock());
          if (ttl === null) continue;
          const status = await sendPushNotification(
            db,
            live.subscription,
            buildRecurringReminderPayload(live.rule, reminder, recipientLanguage(live)),
            { TTL: ttl }
          );
          if (status === "gone") continue;
          await db
            .update(recurringReminderDeliveries)
            .set(status === "sent" ? { deliveredAt: clock() } : { leaseUntil: clock() })
            .where(
              and(
                eq(recurringReminderDeliveries.id, claim.id),
                eq(recurringReminderDeliveries.leaseUntil, claim.leaseUntil),
                isNull(recurringReminderDeliveries.deliveredAt)
              )
            );
          if (status === "sent") result.sent++;
          else result.failed++;
        } catch (error) {
          result.failed++;
          console.error("Recurring reminder failed:", error);
        }
      }
    }
  }
  return result;
}

export async function pruneRecurringReminderDeliveries(db: DrizzleD1, cutoff: Date) {
  await db
    .delete(recurringReminderDeliveries)
    .where(lt(recurringReminderDeliveries.createdAt, cutoff));
}
