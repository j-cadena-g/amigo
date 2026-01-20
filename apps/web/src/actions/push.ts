"use server";

import { db, eq, lt } from "@amigo/db";
import { pushSubscriptions } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { z } from "zod";

// Push subscriptions older than this are considered stale (matches session TTL)
const PUSH_SUBSCRIPTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function subscribePush(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  const parsed = subscribeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid subscription data" };
  }

  try {
    // Upsert subscription (update if endpoint exists, insert otherwise)
    await db
      .insert(pushSubscriptions)
      .values({
        userId: session.userId,
        endpoint: parsed.data.endpoint,
        keys: parsed.data.keys,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: session.userId,
          keys: parsed.data.keys,
          updatedAt: new Date(),
        },
      });

    return { success: true };
  } catch (error) {
    console.error("Failed to save push subscription:", error);
    return { success: false, error: "Failed to save subscription" };
  }
}

export async function unsubscribePush(input: {
  endpoint: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint));

    return { success: true };
  } catch (error) {
    console.error("Failed to remove push subscription:", error);
    return { success: false, error: "Failed to remove subscription" };
  }
}

export async function getSubscriptionStatus(): Promise<{
  hasSubscription: boolean;
}> {
  const session = await getSession();
  if (!session) {
    return { hasSubscription: false };
  }

  const subscription = await db.query.pushSubscriptions.findFirst({
    where: eq(pushSubscriptions.userId, session.userId),
  });

  return { hasSubscription: !!subscription };
}

/**
 * Clean up stale push subscriptions that haven't been updated within the max age.
 * This should be called periodically (e.g., during session refresh or via cron).
 * Subscriptions are considered stale if updatedAt is older than PUSH_SUBSCRIPTION_MAX_AGE_MS.
 */
export async function cleanupStalePushSubscriptions(): Promise<{
  deletedCount: number;
}> {
  const cutoffDate = new Date(Date.now() - PUSH_SUBSCRIPTION_MAX_AGE_MS);

  const result = await db
    .delete(pushSubscriptions)
    .where(lt(pushSubscriptions.updatedAt, cutoffDate))
    .returning({ id: pushSubscriptions.id });

  return { deletedCount: result.length };
}
