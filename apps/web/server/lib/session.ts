import { createClerkClient } from "@clerk/backend";
import type { AppSession } from "../env";
import { getDb, users, households, eq, and, isNull } from "@amigo/db";
import {
  parseClerkHouseholdMetadata,
  setClerkHouseholdMetadata,
} from "./clerk-household-metadata";
import { getSessionCacheKey } from "./session-cache";
import { ActionError } from "./errors";

/** Max age of a warm KV session before re-validating membership against D1. */
const SESSION_WARM_PATH_TTL_MS = 60_000;

type CachedSessionPayload = AppSession & { refreshedAt?: number };

interface ClerkClaims {
  email?: string;
  name?: string;
}

/**
 * Session resolution result. The `status` field indicates whether the user
 * is fully authenticated, needs onboarding, or was removed from a household.
 */
export type SessionResult =
  | { status: "authenticated"; session: AppSession }
  | { status: "needs_setup" }
  | { status: "revoked" }
  | { status: "unauthenticated" };

function buildSession(user: {
  id: string;
  householdId: string;
  role: string;
  email: string;
  name: string | null;
}): AppSession {
  return {
    userId: user.id,
    householdId: user.householdId,
    role: user.role as AppSession["role"],
    email: user.email,
    name: user.name,
  };
}

function isAuthIdUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    /(?:UNIQUE constraint failed: users\.auth_id|UNIQUE constraint failed: users\.authId)/i.test(
      error.message
    )
  );
}

async function fetchClerkProfile(
  clerkSecretKey: string,
  clerkUserId: string,
  claims?: ClerkClaims
) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey });
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const email =
    clerkUser.emailAddresses.find(
      (entry) => entry.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ??
    claims?.email ??
    "unknown@example.com";
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    claims?.name ||
    null;

  return {
    clerk,
    clerkUser,
    email,
    name,
    metadata: parseClerkHouseholdMetadata(clerkUser.publicMetadata),
  };
}

/**
 * Resolves a Clerk user into an app-level session.
 *
 * - Looks up the user by Clerk auth id in D1.
 * - If no active user exists, checks Clerk public metadata for a household tag
 *   and auto-creates a member when the household exists.
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

  const db = getDb(d1);
  const cacheKey = getSessionCacheKey(clerkUserId);
  const cached = await kv.get(cacheKey, "json");

  if (cached) {
    const payload = cached as CachedSessionPayload;
    const refreshedAt = payload.refreshedAt ?? 0;
    if (
      refreshedAt > 0 &&
      Date.now() - refreshedAt < SESSION_WARM_PATH_TTL_MS
    ) {
      return {
        status: "authenticated",
        session: {
          userId: payload.userId,
          householdId: payload.householdId,
          role: payload.role as AppSession["role"],
          email: payload.email,
          name: payload.name,
        },
      };
    }

    const currentUser = await db
      .select({
        id: users.id,
        householdId: users.householdId,
        role: users.role,
        email: users.email,
        name: users.name,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.authId, clerkUserId))
      .get();

    if (currentUser && !currentUser.deletedAt) {
      const refreshedSession = buildSession(currentUser);
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
        });
      }

      return { status: "authenticated", session: refreshedSession };
    }

    if (currentUser?.deletedAt) {
      try {
        await kv.delete(cacheKey);
      } catch (error) {
        console.error("Session cache eviction failed", {
          error,
          cacheKey,
          clerkUserId,
        });
      }
      return { status: "revoked" };
    }

    try {
      await kv.delete(cacheKey);
    } catch (error) {
      console.error("Session cache eviction failed", {
        error,
        cacheKey,
        clerkUserId,
      });
    }
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
    .where(eq(users.authId, clerkUserId))
    .get();

  if (existingUser?.deletedAt) {
    return { status: "revoked" };
  }

  if (existingUser) {
    const session = buildSession(existingUser);
    await writeSessionCache(kv, cacheKey, session, clerkUserId);
    return { status: "authenticated", session };
  }

  const { clerk, email, name, metadata } = await fetchClerkProfile(
    clerkSecretKey,
    clerkUserId,
    claims
  );

  if (metadata.householdId) {
    const household = await db
      .select({ id: households.id, name: households.name })
      .from(households)
      .where(eq(households.id, metadata.householdId))
      .get();

    if (household) {
      let user:
        | {
            id: string;
            householdId: string;
            role: string;
            email: string;
            name: string | null;
          }
        | undefined;

      try {
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
      } catch (error) {
        if (isAuthIdUniqueConstraintError(error)) {
          const concurrentUser = await db
            .select({
              id: users.id,
              householdId: users.householdId,
              role: users.role,
              email: users.email,
              name: users.name,
            })
            .from(users)
            .where(eq(users.authId, clerkUserId))
            .get();

          if (concurrentUser) {
            const session = buildSession(concurrentUser);
            await writeSessionCache(kv, cacheKey, session, clerkUserId);
            return { status: "authenticated", session };
          }
        }

        throw error;
      }

      if (!metadata.householdName || metadata.householdName !== household.name) {
        try {
          await setClerkHouseholdMetadata(clerk, clerkUserId, {
            householdId: household.id,
            householdName: household.name,
          });
        } catch (error) {
          console.error("Failed to sync Clerk household metadata", {
            error,
            clerkUserId,
            householdId: household.id,
          });
        }
      }

      const session = buildSession(user);
      await writeSessionCache(kv, cacheKey, session, clerkUserId);
      return { status: "authenticated", session };
    }
  }

  return { status: "needs_setup" };
}

async function writeSessionCache(
  kv: KVNamespace,
  cacheKey: string,
  session: AppSession,
  clerkUserId: string
) {
  const cachePayload: CachedSessionPayload = {
    ...session,
    refreshedAt: Date.now(),
  };

  try {
    await kv.put(cacheKey, JSON.stringify(cachePayload), {
      expirationTtl: 86400,
    });
  } catch (error) {
    console.error("Session cache write failed", {
      error,
      cacheKey,
      clerkUserId,
    });
  }
}

/** Re-validates a warm cached session against D1 before sensitive mutations. */
export async function assertSessionStillValid(
  db: ReturnType<typeof getDb>,
  session: AppSession
): Promise<void> {
  const currentUser = await db
    .select({
      id: users.id,
      role: users.role,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(
      and(
        eq(users.id, session.userId),
        eq(users.householdId, session.householdId),
        isNull(users.deletedAt)
      )
    )
    .get();

  if (!currentUser) {
    throw new ActionError("Session revoked", "UNAUTHORIZED");
  }

  if (currentUser.role !== session.role) {
    throw new ActionError("Session role changed — please refresh", "UNAUTHORIZED");
  }
}
