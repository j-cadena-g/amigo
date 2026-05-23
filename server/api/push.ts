import { eq, getDb, lt, pushSubscriptions } from "@amigo/db";
import { z } from "zod";
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

    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, parsed.endpoint));

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
