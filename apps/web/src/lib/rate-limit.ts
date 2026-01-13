import { headers } from "next/headers";
import { redis } from "./redis";

interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Key prefix for Redis */
  keyPrefix?: string;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetInSeconds: number;
}

// In-memory fallback rate limiter for when Redis is unavailable
const fallbackStore = new Map<string, { count: number; expiresAt: number }>();
let lastFallbackCleanup = Date.now();
const FALLBACK_CLEANUP_INTERVAL = 60_000;

function cleanupFallbackStore() {
  const now = Date.now();
  if (now - lastFallbackCleanup < FALLBACK_CLEANUP_INTERVAL) return;

  lastFallbackCleanup = now;
  for (const [key, value] of fallbackStore) {
    if (value.expiresAt < now) {
      fallbackStore.delete(key);
    }
  }
}

function fallbackIncr(key: string, windowMs: number): { count: number; ttl: number } {
  cleanupFallbackStore();

  const now = Date.now();
  const existing = fallbackStore.get(key);

  if (existing && existing.expiresAt > now) {
    existing.count++;
    return { count: existing.count, ttl: Math.ceil((existing.expiresAt - now) / 1000) };
  }

  fallbackStore.set(key, { count: 1, expiresAt: now + windowMs });
  return { count: 1, ttl: Math.ceil(windowMs / 1000) };
}

// Track Redis health for logging
let redisHealthy = true;
let lastRedisErrorLog = 0;
const ERROR_LOG_INTERVAL = 60_000;

async function getClientIP(): Promise<string> {
  const headersList = await headers();
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0];
    if (firstIp) {
      return firstIp.trim();
    }
  }
  return "unknown";
}

/**
 * Check rate limit for server actions.
 * Uses Redis with in-memory fallback when Redis is unavailable.
 *
 * @example
 * ```ts
 * const { success, remaining } = await checkRateLimit({
 *   windowMs: 60_000,
 *   maxRequests: 30,
 *   keyPrefix: "action:groceries"
 * });
 * if (!success) {
 *   throw new Error("Too many requests");
 * }
 * ```
 */
export async function checkRateLimit(
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { windowMs, maxRequests, keyPrefix = "action" } = options;
  const windowSeconds = Math.ceil(windowMs / 1000);

  const ip = await getClientIP();
  const key = `${keyPrefix}:${ip}`;

  try {
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    // Redis recovered
    if (!redisHealthy) {
      console.info("[rate-limit] Redis connection restored");
      redisHealthy = true;
    }

    const ttl = await redis.ttl(key);

    return {
      success: current <= maxRequests,
      remaining: Math.max(0, maxRequests - current),
      resetInSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  } catch (error) {
    // Redis unavailable - use in-memory fallback
    const now = Date.now();
    if (redisHealthy || now - lastRedisErrorLog > ERROR_LOG_INTERVAL) {
      console.warn(
        "[rate-limit] Redis unavailable, using in-memory fallback:",
        error instanceof Error ? error.message : "Unknown error"
      );
      lastRedisErrorLog = now;
      redisHealthy = false;
    }

    const { count, ttl } = fallbackIncr(key, windowMs);

    return {
      success: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
      resetInSeconds: ttl,
    };
  }
}

/**
 * Rate limit configuration presets for different action types.
 */
export const RATE_LIMITS = {
  /** Standard mutations (add, update, delete) - 30 per minute */
  MUTATION: { windowMs: 60_000, maxRequests: 30 },
  /** Bulk operations - 10 per minute */
  BULK: { windowMs: 60_000, maxRequests: 10 },
  /** Sensitive operations (settings, members) - 10 per minute */
  SENSITIVE: { windowMs: 60_000, maxRequests: 10 },
  /** Read-heavy operations - 60 per minute */
  READ: { windowMs: 60_000, maxRequests: 60 },
} as const;

/**
 * Helper to enforce rate limiting and throw appropriate error.
 * Use this at the start of server actions.
 *
 * @example
 * ```ts
 * export async function addItem(name: string) {
 *   await enforceRateLimit("action:groceries:add", RATE_LIMITS.MUTATION);
 *   // ... rest of action
 * }
 * ```
 */
export async function enforceRateLimit(
  keyPrefix: string,
  limits: { windowMs: number; maxRequests: number }
): Promise<void> {
  const result = await checkRateLimit({
    ...limits,
    keyPrefix,
  });

  if (!result.success) {
    throw new Error(
      `Too many requests. Please try again in ${result.resetInSeconds} seconds.`
    );
  }
}
