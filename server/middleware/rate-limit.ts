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

export const ROUTE_RATE_LIMITS = {
  assets: {
    list: RATE_LIMIT_PRESETS.READ,
    create: RATE_LIMIT_PRESETS.MUTATION,
    update: RATE_LIMIT_PRESETS.MUTATION,
    delete: RATE_LIMIT_PRESETS.MUTATION,
  },
  audit: {
    list: RATE_LIMIT_PRESETS.READ,
  },
  budgets: {
    list: RATE_LIMIT_PRESETS.READ,
    withSpending: RATE_LIMIT_PRESETS.READ,
    create: RATE_LIMIT_PRESETS.MUTATION,
    update: RATE_LIMIT_PRESETS.MUTATION,
    delete: RATE_LIMIT_PRESETS.MUTATION,
  },
  calendar: {
    list: RATE_LIMIT_PRESETS.READ,
  },
  debts: {
    list: RATE_LIMIT_PRESETS.READ,
    create: RATE_LIMIT_PRESETS.MUTATION,
    update: RATE_LIMIT_PRESETS.MUTATION,
    delete: RATE_LIMIT_PRESETS.MUTATION,
  },
  groceries: {
    list: RATE_LIMIT_PRESETS.READ,
    add: RATE_LIMIT_PRESETS.MUTATION,
    toggle: RATE_LIMIT_PRESETS.MUTATION,
    update: RATE_LIMIT_PRESETS.MUTATION,
    tags: RATE_LIMIT_PRESETS.MUTATION,
    updateDate: RATE_LIMIT_PRESETS.MUTATION,
    delete: RATE_LIMIT_PRESETS.MUTATION,
    clear: RATE_LIMIT_PRESETS.BULK,
  },
  members: {
    list: RATE_LIMIT_PRESETS.READ,
    role: RATE_LIMIT_PRESETS.SENSITIVE,
    transfer: RATE_LIMIT_PRESETS.SENSITIVE,
    summary: RATE_LIMIT_PRESETS.READ,
    remove: RATE_LIMIT_PRESETS.SENSITIVE,
  },
  recurring: {
    list: RATE_LIMIT_PRESETS.READ,
    create: RATE_LIMIT_PRESETS.MUTATION,
    update: RATE_LIMIT_PRESETS.MUTATION,
    delete: RATE_LIMIT_PRESETS.MUTATION,
    toggle: RATE_LIMIT_PRESETS.MUTATION,
    process: RATE_LIMIT_PRESETS.BULK,
  },
  restore: {
    pending: RATE_LIMIT_PRESETS.READ,
    restore: RATE_LIMIT_PRESETS.SENSITIVE,
    freshStart: RATE_LIMIT_PRESETS.SENSITIVE,
    cancel: RATE_LIMIT_PRESETS.SENSITIVE,
  },
  sync: {
    batch: RATE_LIMIT_PRESETS.BULK,
  },
  tags: {
    list: RATE_LIMIT_PRESETS.READ,
    create: RATE_LIMIT_PRESETS.MUTATION,
    update: RATE_LIMIT_PRESETS.MUTATION,
    delete: RATE_LIMIT_PRESETS.MUTATION,
  },
  transactions: {
    list: RATE_LIMIT_PRESETS.READ,
    create: RATE_LIMIT_PRESETS.MUTATION,
    update: RATE_LIMIT_PRESETS.MUTATION,
    delete: RATE_LIMIT_PRESETS.MUTATION,
  },
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
