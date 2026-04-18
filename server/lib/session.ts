import { createClerkClient } from "@clerk/backend";
import type { AppSession } from "../env";
import { getDb, users, households, eq, and, isNull } from "@amigo/db";
import { getSessionCacheKey } from "./session-cache";

/** Max age of a warm KV session before re-validating membership against D1. */
const SESSION_WARM_PATH_TTL_MS = 60_000;

type CachedSessionPayload = AppSession & { refreshedAt?: number };

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
  | { status: "revoked" }
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
  const cacheKey = getSessionCacheKey(clerkUserId, orgId);
  const cached = await kv.get(cacheKey, "json");
  if (cached) {
    const payload = cached as CachedSessionPayload;
    const refreshedAt = payload.refreshedAt ?? 0;
    if (
      refreshedAt > 0 &&
      Date.now() - refreshedAt < SESSION_WARM_PATH_TTL_MS
    ) {
      const session: AppSession = {
        userId: payload.userId,
        householdId: payload.householdId,
        orgId,
        role: payload.role,
        email: payload.email,
        name: payload.name,
      };
      return { status: "authenticated", session };
    }

    const session = payload;

    // Re-hydrate the session from the current user row so role changes
    // and member removals take effect immediately even if KV is warm.
    const currentUser = await db
      .select({
        id: users.id,
        householdId: users.householdId,
        role: users.role,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(
        and(
          eq(users.authId, clerkUserId),
          eq(users.householdId, session.householdId),
          isNull(users.deletedAt)
        )
      )
      .get();

    if (currentUser) {
      const refreshedSession: AppSession = {
        userId: currentUser.id,
        householdId: currentUser.householdId,
        orgId,
        role: currentUser.role as AppSession["role"],
        email: currentUser.email,
        name: currentUser.name,
      };
      const cachePayload: CachedSessionPayload = {
        ...refreshedSession,
        refreshedAt: Date.now(),
      };

      try {
        await kv.put(cacheKey, JSON.stringify(cachePayload), {
          expirationTtl: 86400,
        });
      } catch (error) {
        console.error("Session cache refresh failed", {
          error,
          cacheKey,
          clerkUserId,
          orgId,
        });
      }

      return { status: "authenticated", session: refreshedSession };
    }

    // Warm cache is stale: resolve household once, then check revocation before
    // evicting KV so we avoid an extra cold-path round-trip for removed members.
    const householdForStale = await db
      .select({ id: households.id })
      .from(households)
      .where(eq(households.clerkOrgId, orgId))
      .get();

    if (householdForStale) {
      const removedUser = await db
        .select({ deletedAt: users.deletedAt })
        .from(users)
        .where(
          and(
            eq(users.authId, clerkUserId),
            eq(users.householdId, householdForStale.id)
          )
        )
        .get();

      if (removedUser?.deletedAt) {
        try {
          await kv.delete(cacheKey);
        } catch (error) {
          console.error("Session cache eviction failed", {
            error,
            cacheKey,
            clerkUserId,
            orgId,
          });
        }
        return { status: "revoked" };
      }
    }

    // Stale session — evict from KV
    try {
      await kv.delete(cacheKey);
    } catch (error) {
      console.error("Session cache eviction failed", {
        error,
        cacheKey,
        clerkUserId,
        orgId,
      });
    }
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

  const existingUser = await db
    .select({
      id: users.id,
      householdId: users.householdId,
      role: users.role,
      email: users.email,
      name: users.name,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(and(eq(users.authId, clerkUserId), eq(users.householdId, household.id)))
    .get();

  if (existingUser?.deletedAt) {
    return { status: "revoked" };
  }

  // Reuse the cold-path household user when present to avoid a second identical lookup.
  let user = existingUser
    ? {
        id: existingUser.id,
        householdId: existingUser.householdId,
        role: existingUser.role,
        email: existingUser.email,
        name: existingUser.name,
      }
    : null;

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
    orgId,
    role: user.role as AppSession["role"],
    email: user.email,
    name: user.name,
  };
  const coldCachePayload: CachedSessionPayload = {
    ...session,
    refreshedAt: Date.now(),
  };

  // Cache in KV (24h TTL)
  try {
    await kv.put(cacheKey, JSON.stringify(coldCachePayload), {
      expirationTtl: 86400,
    });
  } catch (error) {
    console.error("Session cache write failed", {
      error,
      cacheKey,
      clerkUserId,
      orgId,
    });
  }

  return { status: "authenticated", session };
}
