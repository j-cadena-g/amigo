import { ActionError } from "../lib/errors";

export interface RateLimitPreset {
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_PRESETS = {
  MUTATION: { limit: 30, windowMs: 60000 },
  BULK: { limit: 10, windowMs: 60000 },
  SENSITIVE: { limit: 10, windowMs: 60000 },
  READ: { limit: 60, windowMs: 60000 },
} as const;

interface RateRecord {
  count: number;
  resetAt: number;
}

export async function enforceRateLimit(
  kv: KVNamespace,
  key: string,
  preset: RateLimitPreset
): Promise<void> {
  const record = (await kv.get(`rate:${key}`, "json")) as RateRecord | null;
  const now = Date.now();

  if (!record || now > record.resetAt) {
    await kv.put(
      `rate:${key}`,
      JSON.stringify({ count: 1, resetAt: now + preset.windowMs }),
      { expirationTtl: Math.ceil(preset.windowMs / 1000) }
    );
    return;
  }

  if (record.count >= preset.limit) {
    throw new ActionError("Too many requests", "RATE_LIMITED");
  }

  await kv.put(
    `rate:${key}`,
    JSON.stringify({ count: record.count + 1, resetAt: record.resetAt }),
    { expirationTtl: Math.ceil(preset.windowMs / 1000) }
  );
}

/**
 * Check rate limit without throwing. Returns { allowed: true } or { allowed: false }.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  preset: RateLimitPreset
): Promise<{ allowed: boolean }> {
  const record = (await kv.get(`rate:${key}`, "json")) as RateRecord | null;
  const now = Date.now();

  if (!record || now > record.resetAt) {
    await kv.put(
      `rate:${key}`,
      JSON.stringify({ count: 1, resetAt: now + preset.windowMs }),
      { expirationTtl: Math.ceil(preset.windowMs / 1000) }
    );
    return { allowed: true };
  }

  if (record.count >= preset.limit) {
    return { allowed: false };
  }

  await kv.put(
    `rate:${key}`,
    JSON.stringify({ count: record.count + 1, resetAt: record.resetAt }),
    { expirationTtl: Math.ceil(preset.windowMs / 1000) }
  );
  return { allowed: true };
}
