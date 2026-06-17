import { and, eq, getDb, lt, pushSubscriptions } from "@amigo/db";
import { z } from "zod";
import { ActionError } from "../lib/errors";
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

  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(normalized.replace(/^0+/, ""));
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
        return Response.json(
          { error: "Subscription endpoint belongs to another user" },
          { status: 403 }
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
      return Response.json(
        { error: "Subscription endpoint belongs to another user" },
        { status: 403 }
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
    headers: { Allow: "GET, POST, DELETE" },
  });
};

export async function cleanupStalePushSubscriptions(
  env: { DB: D1Database }
): Promise<{ deletedCount: number }> {
  const db = getDb(env.DB);
  const cutoffDate = new Date(Date.now() - PUSH_SUBSCRIPTION_MAX_AGE_MS);

  const result = await db
    .delete(pushSubscriptions)
    .where(lt(pushSubscriptions.updatedAt, cutoffDate))
    .returning({ id: pushSubscriptions.id });

  return { deletedCount: result.length };
}
