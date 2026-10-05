import {
  and,
  eq,
  getDb,
  isNull,
  lt,
  notInArray,
  or,
  pushSubscriptions,
  scopeToHousehold,
  sql,
  transactions,
  users,
} from "@amigo/db";
import { z } from "zod";
import { ActionError, jsonError } from "../lib/errors";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import type { ApiHandler } from "./route";

const PUSH_SUBSCRIPTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

const preferencesSchema = z
  .object({
    groceryNotifications: z.boolean().optional(),
    recurringNotifications: z.boolean().optional(),
    transactionNotifications: z.boolean().optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.groceryNotifications !== undefined ||
      body.recurringNotifications !== undefined ||
      body.transactionNotifications !== undefined,
    { message: "Nothing to update" }
  );

function isIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255 && String(value) === part;
  });
}

function isUnsafeIPv4(host: string): boolean {
  if (!isIPv4(host)) return false;
  const [a = 0, b = 0] = host.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isUnsafeIPv6(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized.includes(":")) return false;
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) return true;

  const ipv4Tail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (ipv4Tail && isUnsafeIPv4(ipv4Tail)) return true;

  return /^(fc|fd|fe8|fe9|fea|feb|fec|fed|fee|fef|ff)/.test(
    normalized.replace(/^0+/, "")
  );
}

function assertSafePushEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    isUnsafeIPv4(hostname) ||
    isUnsafeIPv6(hostname)
  ) {
    throw new ActionError(
      "Unsafe push subscription endpoint",
      "VALIDATION_ERROR"
    );
  }
}

export const handlePushRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const path = params["*"] ?? "";
  const db = getDb(env.DB);

  if (path === "preferences") {
    if (request.method !== "GET" && request.method !== "PATCH") {
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, PATCH" },
      });
    }

    await enforceRateLimit(
      env,
      `${session!.userId}:push:preferences:${request.method.toLowerCase()}`,
      request.method === "GET"
        ? ROUTE_RATE_LIMITS.push.preferencesGet
        : ROUTE_RATE_LIMITS.push.preferencesPatch
    );

    const currentUser = and(
      eq(users.id, session!.userId),
      scopeToHousehold(users.householdId, session!.householdId),
      isNull(users.deletedAt)
    );
    if (request.method === "PATCH") {
      const parsed = preferencesSchema.parse(await request.json());
      const [preferences] = await db
        .update(users)
        .set(parsed)
        .where(currentUser)
        .returning({
          groceryNotifications: users.groceryNotifications,
          recurringNotifications: users.recurringNotifications,
          transactionNotifications: users.transactionNotifications,
        });

      return preferences
        ? Response.json(preferences)
        : jsonError("Account access revoked", "PERMISSION_DENIED");
    }

    const preferences = await db.query.users.findFirst({
      columns: {
        groceryNotifications: true,
        recurringNotifications: true,
        transactionNotifications: true,
      },
      where: currentUser,
    });
    return preferences
      ? Response.json(preferences)
      : jsonError("Account access revoked", "PERMISSION_DENIED");
  }

  if (request.method === "GET" && path === "status") {
    const subscription = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.userId, session!.userId),
    });
    return Response.json({
      hasSubscription: !!subscription,
      vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
    });
  }

  if (request.method === "POST" && !path) {
    const parsed = subscribeSchema.parse(await request.json());
    assertSafePushEndpoint(parsed.endpoint);

    const existing = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.endpoint, parsed.endpoint),
    });

    if (existing) {
      if (existing.userId !== session!.userId) {
        return jsonError(
          "Subscription endpoint belongs to another user",
          "PERMISSION_DENIED"
        );
      }

      await db
        .update(pushSubscriptions)
        .set({
          keys: parsed.keys,
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.endpoint, parsed.endpoint));
    } else {
      await db.insert(pushSubscriptions).values({
        userId: session!.userId,
        endpoint: parsed.endpoint,
        keys: parsed.keys,
      });
    }

    return Response.json({ success: true });
  }

  if (request.method === "DELETE" && !path) {
    const parsed = unsubscribeSchema.parse(await request.json());
    assertSafePushEndpoint(parsed.endpoint);

    const existing = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.endpoint, parsed.endpoint),
    });

    if (existing && existing.userId !== session!.userId) {
      return jsonError(
        "Subscription endpoint belongs to another user",
        "PERMISSION_DENIED"
      );
    }

    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, parsed.endpoint),
          eq(pushSubscriptions.userId, session!.userId)
        )
      );

    return Response.json({ success: true });
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};

export async function cleanupStalePushSubscriptions(
  env: { DB: D1Database }
): Promise<{ deletedCount: number }> {
  const db = getDb(env.DB);
  const cutoffDate = new Date(Date.now() - PUSH_SUBSCRIPTION_MAX_AGE_MS);

  // Reminders may have no deliveries for longer than a week. Keep devices for
  // active reminder recipients until they opt out or a push provider expires them.
  const reminderRecipients = db
    .select({ id: users.id })
    .from(users)
    .where(and(
      isNull(users.deletedAt),
      or(
        eq(users.recurringNotifications, true),
        and(
          eq(users.transactionNotifications, true),
          sql`EXISTS (
            SELECT 1 FROM ${transactions}
            WHERE ${transactions.reminderUserId} = ${users.id}
              AND ${transactions.householdId} = ${users.householdId}
              AND ${transactions.deletedAt} IS NULL
              AND EXISTS (
                SELECT 1 FROM json_each(${transactions.reminderTimes}) AS reminder
                WHERE reminder.value >= ${new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()}
              )
          )`
        )
      )
    ));

  const result = await db
    .delete(pushSubscriptions)
    .where(
      and(
        lt(pushSubscriptions.updatedAt, cutoffDate),
        notInArray(pushSubscriptions.userId, reminderRecipients)
      )
    )
    .returning({ id: pushSubscriptions.id });

  return { deletedCount: result.length };
}
