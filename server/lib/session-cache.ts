const SESSION_CACHE_PREFIX = "session";

export function getSessionCacheKey(authId: string): string {
  return `${SESSION_CACHE_PREFIX}:${authId}`;
}

async function deleteWithLogging(
  kv: KVNamespace,
  key: string,
  authId: string
): Promise<void> {
  try {
    await kv.delete(key);
  } catch (error) {
    console.error("Session cache delete failed", { error, key, authId });
  }
}

export async function invalidateSessionCache(
  kv: KVNamespace,
  authId: string | null | undefined
): Promise<void> {
  if (!authId) return;
  await deleteWithLogging(kv, getSessionCacheKey(authId), authId);
}

export async function invalidateSessionCachesForHouseholdMembers(
  env: { CACHE: KVNamespace },
  members: Array<{ authId: string | null }>
): Promise<void> {
  await Promise.all(
    members.map((member) =>
      invalidateSessionCache(env.CACHE, member.authId)
    )
  );
}
