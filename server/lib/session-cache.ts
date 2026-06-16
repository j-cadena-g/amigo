import type { Env } from "../env";
import { logSecurityEvent } from "./errors";

const SESSION_CACHE_PREFIX = "session";

export function getSessionCacheKey(authId: string, orgId: string): string {
  return `${SESSION_CACHE_PREFIX}:${authId}:${orgId}`;
}

async function deleteWithRetry(
  kv: KVNamespace,
  cacheKey: string,
  authId: string,
  orgId: string
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await kv.delete(cacheKey);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  console.error("Session cache invalidation failed after retry", {
    error: lastError,
    cacheKey,
    authId,
    orgId,
  });
  logSecurityEvent("session_cache_invalidation_failed", {
    authId,
    orgId,
    cacheKey,
  });
}

export async function invalidateSessionCache(
  kv: KVNamespace,
  authId: string | null | undefined,
  orgId: string | null | undefined
): Promise<void> {
  if (!authId || !orgId) return;
  await deleteWithRetry(kv, getSessionCacheKey(authId, orgId), authId, orgId);
}

export async function invalidateSessionCachesForHouseholdMembers(
  env: Env,
  members: Array<{ authId: string | null; orgId: string | null }>
): Promise<void> {
  await Promise.all(
    members.map((member) => invalidateSessionCache(env.CACHE, member.authId, member.orgId))
  );
}
