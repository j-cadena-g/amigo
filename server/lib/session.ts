import { createClerkClient } from "@clerk/backend";
import type { AppSession } from "../env";
import { getDb, users, households, eq, and, isNull } from "@amigo/db";

interface ClerkClaims {
  email?: string;
  name?: string;
  orgId?: string;
}

/**
 * Session resolution result. The `status` field indicates whether the user
 * is fully authenticated, needs onboarding, or lacks org membership.
 */
export type SessionResult =
  | { status: "authenticated"; session: AppSession }
  | { status: "no_org" }
  | { status: "needs_setup"; clerkOrgId: string }
  | { status: "unauthenticated" };

/**
 * Resolves a Clerk user into an app-level session.
 *
 * - Requires an active Clerk Organization (`orgId` in claims).
 * - Looks up the household by `clerkOrgId`.
 * - If no household exists, returns `needs_setup` (setup wizard required).
 * - If household exists but user has no record, auto-creates the user.
 * - Uses KV caching with 24h TTL.
 */
export async function resolveSession(
  clerkUserId: string | null | undefined,
  d1: D1Database,
  kv: KVNamespace,
  clerkSecretKey: string,
  claims?: ClerkClaims
): Promise<SessionResult> {
  if (!clerkUserId) return { status: "unauthenticated" };
  if (!claims?.orgId) return { status: "no_org" };

  const orgId = claims.orgId;
  const db = getDb(d1);

  // Check KV cache first (keyed by user + org to handle org switching)
  const cacheKey = `session:${clerkUserId}:${orgId}`;
  const cached = await kv.get(cacheKey, "json");
  if (cached) {
    const session = cached as AppSession;

    // Verify membership is still valid (guard against stale KV)
    const membership = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.authId, clerkUserId),
          eq(users.householdId, session.householdId),
          isNull(users.deletedAt)
        )
      )
      .get();

    if (membership) {
      return { status: "authenticated", session };
    }

    // Stale session — evict from KV
    await kv.delete(cacheKey);
  }

  // Look up household by Clerk org ID
  const household = await db
    .select()
    .from(households)
    .where(eq(households.clerkOrgId, orgId))
    .get();

  if (!household) {
    // Household doesn't exist yet — setup wizard needed
    return { status: "needs_setup", clerkOrgId: orgId };
  }

  // Check for existing user in this household
  let user = await db
    .select()
    .from(users)
    .where(and(eq(users.authId, clerkUserId), isNull(users.deletedAt)))
    .get();

  if (!user) {
    // Fetch user details from Clerk Backend API (JWT claims don't include email/name by default)
    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const clerkUser = await clerk.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ?? claims.email ?? "unknown@example.com";
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || claims.name || null;

    // User exists in Clerk org but not in D1 — auto-create as member
    user = await db
      .insert(users)
      .values({
        authId: clerkUserId,
        email,
        name,
        householdId: household.id,
        role: "member",
      })
      .returning()
      .get();
  }

  const session: AppSession = {
    userId: user.id,
    householdId: user.householdId,
    role: user.role as AppSession["role"],
    email: user.email,
    name: user.name,
  };

  // Cache in KV (24h TTL)
  await kv.put(cacheKey, JSON.stringify(session), {
    expirationTtl: 86400,
  });

  return { status: "authenticated", session };
}
