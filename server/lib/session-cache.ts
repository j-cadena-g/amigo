import type { Env } from "../env";

const SESSION_CACHE_PREFIX = "session";

export function getSessionCacheKey(authId: string, orgId: string): string {
  return `${SESSION_CACHE_PREFIX}:${authId}:${orgId}`;
}

export async function invalidateSessionCache(
  kv: KVNamespace,
  authId: string | null | undefined,
  orgId: string | null | undefined
): Promise<void> {
  if (!authId || !orgId) return;
  await kv.delete(getSessionCacheKey(authId, orgId));
}

export async function invalidateSessionCachesForHouseholdMembers(
  env: Env,
  members: Array<{ authId: string | null; orgId: string | null }>
): Promise<void> {
  await Promise.all(
    members.map((member) => invalidateSessionCache(env.CACHE, member.authId, member.orgId))
  );
}
