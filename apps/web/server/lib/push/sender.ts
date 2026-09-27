import webpush from "web-push";
import { eq, getDb, households, pushSubscriptions, users, type UiLanguage } from "@amigo/db";
import { resolveLanguage, resolveLocale } from "@/app/lib/locale";
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

/** A member's interface language from their saved choices; no browser to ask here. */
function recipientLanguage(user: {
  locale: string | null;
  language: string | null;
  homeCurrency: string | null;
}): UiLanguage {
  const locale = resolveLocale({
    preferred: user.locale,
    homeCurrency: user.homeCurrency,
    language: user.language,
  });
  return resolveLanguage({ preferred: user.language, locale });
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
      locale: users.locale,
      language: users.language,
      homeCurrency: households.homeCurrency,
      subscription: pushSubscriptions,
    })
    .from(users)
    .innerJoin(households, eq(households.id, users.householdId))
    .leftJoin(pushSubscriptions, eq(users.id, pushSubscriptions.userId))
    .where(eq(users.householdId, householdId));

  const subscriptionsByUser = new Map<
    string,
    { language: UiLanguage; subs: Array<typeof pushSubscriptions.$inferSelect> }
  >();

  for (const row of householdUsers) {
    if (!row.subscription) continue;
    const existing = subscriptionsByUser.get(row.userId) ?? {
      language: recipientLanguage(row),
      subs: [],
    };
    existing.subs.push(row.subscription);
    subscriptionsByUser.set(row.userId, existing);
  }

  // Each member reads the notification in their own language.
  const payloads = new Map<UiLanguage, NotificationPayload>();
  for (const [userId, { language, subs }] of subscriptionsByUser) {
    if (actorUserIds.includes(userId)) continue;
    let payload = payloads.get(language);
    if (!payload) {
      payload = buildNotificationPayload(events, language);
      payloads.set(language, payload);
    }
    await sendToSubscriptions(db, subs, payload);
  }
}

const COPY: Record<
  UiLanguage,
  {
    title: string;
    someone: string;
    addedOne: (actors: string, many: boolean, item: string) => string;
    addedMany: (actors: string, many: boolean, count: number) => string;
    boughtOne: (actors: string, many: boolean, item: string) => string;
    boughtMany: (actors: string, many: boolean, count: number) => string;
    updated: (actors: string, many: boolean) => string;
  }
> = {
  en: {
    title: "Grocery List Update",
    someone: "Someone",
    addedOne: (actors, _many, item) => `${actors} added ${item} to the list`,
    addedMany: (actors, _many, count) => `${actors} added ${count} items to the list`,
    boughtOne: (actors, _many, item) => `${actors} marked ${item} as purchased`,
    boughtMany: (actors, _many, count) => `${actors} marked ${count} items as purchased`,
    updated: (actors) => `${actors} updated the grocery list`,
  },
  es: {
    title: "Cambios en la lista de compras",
    someone: "Alguien",
    addedOne: (actors, many, item) => `${actors} ${many ? "agregaron" : "agregó"} ${item} a la lista`,
    addedMany: (actors, many, count) =>
      `${actors} ${many ? "agregaron" : "agregó"} ${count} artículos a la lista`,
    // "compró", not "marcó … como comprado", so the item's gender never has to agree.
    boughtOne: (actors, many, item) => `${actors} ${many ? "compraron" : "compró"} ${item}`,
    boughtMany: (actors, many, count) =>
      `${actors} ${many ? "compraron" : "compró"} ${count} artículos`,
    updated: (actors, many) =>
      `${actors} ${many ? "actualizaron" : "actualizó"} la lista de compras`,
  },
};

/** The notification text for one batch of grocery changes, in `language`. */
export function buildNotificationPayload(
  events: GroceryPushEvent[],
  language: UiLanguage = "en"
): NotificationPayload {
  const copy = COPY[language];
  const addEvents = events.filter((e) => e.type === "add");
  const purchaseEvents = events.filter((e) => e.type === "purchase");

  const actorNames = [...new Set(events.map((e) => e.actorName))].filter(Boolean);
  const actors =
    actorNames.length === 0
      ? copy.someone
      : new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(actorNames);
  const many = actorNames.length > 1;

  let body: string;

  if (addEvents.length > 0 && purchaseEvents.length === 0) {
    const firstAddEvent = addEvents[0];
    body =
      addEvents.length === 1 && firstAddEvent
        ? copy.addedOne(actors, many, firstAddEvent.itemName)
        : copy.addedMany(actors, many, addEvents.length);
  } else if (purchaseEvents.length > 0 && addEvents.length === 0) {
    const firstPurchaseEvent = purchaseEvents[0];
    body =
      purchaseEvents.length === 1 && firstPurchaseEvent
        ? copy.boughtOne(actors, many, firstPurchaseEvent.itemName)
        : copy.boughtMany(actors, many, purchaseEvents.length);
  } else {
    body = copy.updated(actors, many);
  }

  return {
    title: copy.title,
    body,
    icon: "/icon-192.png",
    badge: "/badge-96.png",
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
