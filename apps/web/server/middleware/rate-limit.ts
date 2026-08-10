import type { Env } from "../env";
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
    convert: RATE_LIMIT_PRESETS.MUTATION,
  },
  accounts: {
    list: RATE_LIMIT_PRESETS.READ,
    create: RATE_LIMIT_PRESETS.MUTATION,
    update: RATE_LIMIT_PRESETS.MUTATION,
    delete: RATE_LIMIT_PRESETS.MUTATION,
    archive: RATE_LIMIT_PRESETS.MUTATION,
  },
  audit: {
    list: RATE_LIMIT_PRESETS.READ,
  },
  budgets: {
    list: RATE_LIMIT_PRESETS.READ,
    withSpending: RATE_LIMIT_PRESETS.READ,
    matchCategory: RATE_LIMIT_PRESETS.READ,
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
    leave: RATE_LIMIT_PRESETS.SENSITIVE,
  },
  invites: {
    list: RATE_LIMIT_PRESETS.READ,
    create: RATE_LIMIT_PRESETS.SENSITIVE,
    revoke: RATE_LIMIT_PRESETS.SENSITIVE,
    resend: RATE_LIMIT_PRESETS.SENSITIVE,
    accept: RATE_LIMIT_PRESETS.SENSITIVE,
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
  },
  settings: {
    get: RATE_LIMIT_PRESETS.READ,
    patch: RATE_LIMIT_PRESETS.MUTATION,
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
  categories: {
    list: RATE_LIMIT_PRESETS.READ,
    create: RATE_LIMIT_PRESETS.MUTATION,
    update: RATE_LIMIT_PRESETS.MUTATION,
    delete: RATE_LIMIT_PRESETS.MUTATION,
    mappingsList: RATE_LIMIT_PRESETS.READ,
    mappingsUpdate: RATE_LIMIT_PRESETS.MUTATION,
  },
  transactions: {
    list: RATE_LIMIT_PRESETS.READ,
    export: RATE_LIMIT_PRESETS.READ,
    import: RATE_LIMIT_PRESETS.BULK,
    create: RATE_LIMIT_PRESETS.MUTATION,
    update: RATE_LIMIT_PRESETS.MUTATION,
    delete: RATE_LIMIT_PRESETS.MUTATION,
  },
} as const;

import type { RateLimiterBinding } from "../env";

// Preset matching uses reference equality; callers must pass constants from
// RATE_LIMIT_PRESETS (via ROUTE_RATE_LIMITS). Unknown objects fall back to mutation.
function getRateLimiter(env: Env, preset: RateLimitPreset): RateLimiterBinding {
  if (preset === RATE_LIMIT_PRESETS.BULK) {
    return env.RATE_LIMIT_BULK;
  }
  if (preset === RATE_LIMIT_PRESETS.SENSITIVE) {
    return env.RATE_LIMIT_SENSITIVE;
  }
  if (preset === RATE_LIMIT_PRESETS.READ) {
    return env.RATE_LIMIT_READ;
  }
  return env.RATE_LIMIT_MUTATION;
}

export async function enforceRateLimit(
  env: Env,
  key: string,
  preset: RateLimitPreset
): Promise<void> {
  const limiter = getRateLimiter(env, preset);
  const { success } = await limiter.limit({ key });
  if (!success) {
    throw new ActionError("Too many requests", "RATE_LIMITED");
  }
}

/**
 * Check rate limit without throwing. Returns { allowed: true } or { allowed: false }.
 *
 * Unlike the old KV-based implementation, Cloudflare's native limiter always
 * consumes a token on every call (including when `allowed` is false). Callers
 * that soft-skip work when limited should expect repeated calls to extend the
 * rate-limit window rather than peeking without penalty.
 */
export async function checkRateLimit(
  env: Env,
  key: string,
  preset: RateLimitPreset
): Promise<{ allowed: boolean }> {
  const limiter = getRateLimiter(env, preset);
  const { success } = await limiter.limit({ key });
  return { allowed: success };
}
