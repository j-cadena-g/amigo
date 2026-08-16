import webpush from "web-push";
import { eq, getDb, pushSubscriptions, users } from "@amigo/db";
import type { Env } from "../../env";
import type { GroceryPushEvent } from "./batching";

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    url?: string;
    type?: string;
  };
}

let vapidConfigured = false;

function ensureVapidConfigured(env: Env): boolean {
  if (vapidConfigured) return true;

  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = env;
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("processPushBatch skipped: VAPID is not configured");
    return false;
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

/**
 * Process a batch of grocery events and send notifications to household
 * members except the actors who made the changes.
 */
export async function processPushBatch(
  env: Env,
  householdId: string,
  events: GroceryPushEvent[]
): Promise<void> {
  if (events.length === 0) return;
  if (!ensureVapidConfigured(env)) return;

  const actorUserIds = [...new Set(events.map((e) => e.actorUserId))];
  const db = getDb(env.DB);

  const householdUsers = await db
    .select({
      userId: users.id,
      subscription: pushSubscriptions,
    })
    .from(users)
    .leftJoin(pushSubscriptions, eq(users.id, pushSubscriptions.userId))
    .where(eq(users.householdId, householdId));

  const subscriptionsByUser = new Map<
    string,
    Array<typeof pushSubscriptions.$inferSelect>
  >();

  for (const row of householdUsers) {
    if (!row.subscription) continue;
    const existing = subscriptionsByUser.get(row.userId) ?? [];
    existing.push(row.subscription);
    subscriptionsByUser.set(row.userId, existing);
  }

  const payload = buildNotificationPayload(events);

  for (const [userId, subs] of subscriptionsByUser) {
    if (actorUserIds.includes(userId)) continue;
    await sendToSubscriptions(db, subs, payload);
  }
}

function buildNotificationPayload(
  events: GroceryPushEvent[]
): NotificationPayload {
  const addEvents = events.filter((e) => e.type === "add");
  const purchaseEvents = events.filter((e) => e.type === "purchase");

  const actorNames = [...new Set(events.map((e) => e.actorName))].filter(
    Boolean
  );
  const actorDisplay =
    actorNames.length === 0
      ? "Someone"
      : actorNames.length === 1
        ? actorNames[0]
        : `${actorNames.slice(0, -1).join(", ")} and ${actorNames.at(-1)}`;

  let body: string;

  if (addEvents.length > 0 && purchaseEvents.length === 0) {
    const firstAddEvent = addEvents[0];
    if (addEvents.length === 1 && firstAddEvent) {
      body = `${actorDisplay} added ${firstAddEvent.itemName} to the list`;
    } else {
      body = `${actorDisplay} added ${addEvents.length} items to the list`;
    }
  } else if (purchaseEvents.length > 0 && addEvents.length === 0) {
    const firstPurchaseEvent = purchaseEvents[0];
    if (purchaseEvents.length === 1 && firstPurchaseEvent) {
      body = `${actorDisplay} marked ${firstPurchaseEvent.itemName} as purchased`;
    } else {
      body = `${actorDisplay} marked ${purchaseEvents.length} items as purchased`;
    }
  } else {
    body = `${actorDisplay} updated the grocery list`;
  }

  return {
    title: "Grocery List Update",
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "grocery-update",
    data: {
      url: "/groceries",
      type: "grocery-update",
    },
  };
}

async function sendToSubscriptions(
  db: ReturnType<typeof getDb>,
  subscriptions: Array<typeof pushSubscriptions.$inferSelect>,
  payload: NotificationPayload
): Promise<void> {
  const payloadString = JSON.stringify(payload);

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        payloadString
      );

      await db
        .update(pushSubscriptions)
        .set({ lastPushAt: new Date() })
        .where(eq(pushSubscriptions.id, subscription.id));
    } catch (error) {
      if (isPushSubscriptionGone(error)) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, subscription.id));
      } else {
        console.error("Push notification failed:", error);
      }
    }
  }
}

function isPushSubscriptionGone(error: unknown): boolean {
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = (error as { statusCode: number }).statusCode;
    return statusCode === 404 || statusCode === 410;
  }
  return false;
}
