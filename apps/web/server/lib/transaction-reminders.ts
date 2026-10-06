import {
  and,
  eq,
  getDb,
  households,
  isNotNull,
  isNull,
  lt,
  lte,
  pushSubscriptions,
  scopeToHousehold,
  sql,
  transactionReminderDeliveries,
  transactions,
  users,
  visibleFinancialTransactionsCondition,
  type DrizzleD1,
  type Transaction,
  type UiLanguage,
} from "@amigo/db";
import type { Env } from "../env";
import {
  ensureVapidConfigured,
  recipientLanguage,
  sendPushNotification,
  type NotificationPayload,
} from "./push/sender";

const LATENESS_MS = 3 * 60 * 60_000;
const LEASE_MS = 5 * 60_000;

/** No catch-up beyond three hours; notification lifetime ends at the same deadline. */
export function transactionReminderTtl(reminderAt: string, now: Date): number | null {
  const at = new Date(reminderAt).getTime();
  const elapsed = now.getTime() - at;
  if (!Number.isFinite(at) || elapsed < 0 || elapsed >= LATENESS_MS) return null;
  const ttl = Math.floor((LATENESS_MS - elapsed) / 1000);
  return ttl > 0 ? ttl : null;
}

export function buildTransactionReminderPayload(
  transaction: Pick<Transaction, "id" | "description" | "category">,
  reminderAt: string,
  language: UiLanguage
): NotificationPayload {
  const label = transaction.description?.trim() || transaction.category;
  return {
    title: language === "es" ? "Recordatorio de transacción" : "Transaction reminder",
    body: language === "es" ? `Recordatorio: ${label}` : `Reminder: ${label}`,
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    tag: `transaction-reminder:${transaction.id}:${reminderAt}`,
    data: { url: "/financial", type: "transaction-reminder" },
  };
}

export async function claimTransactionReminderDelivery(
  db: DrizzleD1,
  transactionId: string,
  subscriptionId: string,
  reminderAt: string,
  now: Date
) {
  const id = `transaction-reminder:${JSON.stringify([transactionId, reminderAt, subscriptionId])}`;
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const claimed = await db
    .insert(transactionReminderDeliveries)
    .values({
      id,
      transactionId,
      subscriptionId,
      reminderAt: new Date(reminderAt),
      leaseUntil,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: transactionReminderDeliveries.id,
      set: { leaseUntil },
      setWhere: and(
        isNull(transactionReminderDeliveries.deliveredAt),
        lte(transactionReminderDeliveries.leaseUntil, now)
      ),
    })
    .returning({ id: transactionReminderDeliveries.id })
    .get();
  return claimed ? { id, leaseUntil } : null;
}

/** Send only to the member who explicitly selected these transaction reminder times. */
export async function processTransactionReminders(env: Env, clock: () => Date = () => new Date()) {
  const result = { sent: 0, failed: 0 };
  if (!ensureVapidConfigured(env)) return result;
  const db = getDb(env.DB);
  const initialNow = clock();
  const earliest = new Date(initialNow.getTime() - LATENESS_MS).toISOString();
  // System cron has no session. The partial index excludes rows with no reminder recipient;
  // json_each bounds candidates to due times. All subsequent reads are household scoped.
  const candidates = await db
    .select({
      transaction: transactions,
      userId: users.id,
      householdId: users.householdId,
      subscriptionId: pushSubscriptions.id,
    })
    .from(users)
    .innerJoin(
      transactions,
      and(
        eq(users.id, transactions.reminderUserId),
        eq(transactions.householdId, users.householdId)
      )
    )
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id))
    .where(
      and(
        isNotNull(transactions.reminderUserId),
        isNull(transactions.deletedAt),
        isNull(users.deletedAt),
        eq(users.transactionNotifications, true),
        sql`EXISTS (SELECT 1 FROM json_each(${transactions.reminderTimes}) AS selected_reminder
        WHERE selected_reminder.value > ${earliest}
        AND selected_reminder.value <= ${initialNow.toISOString()})`
      )
    );

  for (const candidate of candidates) {
    for (const reminderAt of new Set(candidate.transaction.reminderTimes)) {
      try {
        if (transactionReminderTtl(reminderAt, clock()) === null) continue;
        // Re-read selected times, membership, visibility and settings for every delivery.
        const loadLive = () =>
          db
            .select({
              transaction: transactions,
              locale: users.locale,
              language: users.language,
              homeCurrency: households.homeCurrency,
              subscription: pushSubscriptions,
            })
            .from(transactions)
            .innerJoin(users, eq(users.id, transactions.reminderUserId))
            .innerJoin(households, eq(households.id, users.householdId))
            .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id))
            .where(
              and(
                scopeToHousehold(transactions.householdId, candidate.householdId),
                scopeToHousehold(users.householdId, candidate.householdId),
                visibleFinancialTransactionsCondition(candidate.userId),
                eq(transactions.id, candidate.transaction.id),
                eq(transactions.reminderUserId, candidate.userId),
                eq(users.transactionNotifications, true),
                isNull(users.deletedAt),
                isNull(transactions.deletedAt),
                eq(pushSubscriptions.id, candidate.subscriptionId),
                sql`EXISTS (SELECT 1 FROM json_each(${transactions.reminderTimes}) AS selected_reminder
              WHERE selected_reminder.value = ${reminderAt})`
              )
            )
            .get();
        let live = await loadLive();
        if (!live) continue;
        const claimTime = clock();
        if (transactionReminderTtl(reminderAt, claimTime) === null) continue;
        const claim = await claimTransactionReminderDelivery(
          db,
          live.transaction.id,
          live.subscription.id,
          reminderAt,
          claimTime
        );
        if (!claim) continue;
        // A concurrent edit/cancellation or membership change may have happened while claiming.
        live = await loadLive();
        if (!live) continue;
        const ttl = transactionReminderTtl(reminderAt, clock());
        if (ttl === null) continue;
        const status = await sendPushNotification(
          db,
          live.subscription,
          buildTransactionReminderPayload(live.transaction, reminderAt, recipientLanguage(live)),
          { TTL: ttl }
        );
        if (status === "gone") continue;
        await db
          .update(transactionReminderDeliveries)
          .set(status === "sent" ? { deliveredAt: clock() } : { leaseUntil: clock() })
          .where(
            and(
              eq(transactionReminderDeliveries.id, claim.id),
              eq(transactionReminderDeliveries.leaseUntil, claim.leaseUntil),
              isNull(transactionReminderDeliveries.deliveredAt)
            )
          );
        if (status === "sent") result.sent++;
        else result.failed++;
      } catch (error) {
        result.failed++;
        console.error("Transaction reminder failed:", error);
      }
    }
  }
  return result;
}

export async function pruneTransactionReminderDeliveries(db: DrizzleD1, cutoff: Date) {
  await db
    .delete(transactionReminderDeliveries)
    .where(lt(transactionReminderDeliveries.createdAt, cutoff));
}
