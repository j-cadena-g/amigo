import type { Context, Next } from "hono";
import { redis } from "./redis";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

// In-memory fallback rate limiter for when Redis is unavailable
const fallbackStore = new Map<string, { count: number; expiresAt: number }>();
let lastFallbackCleanup = Date.now();
const FALLBACK_CLEANUP_INTERVAL = 60_000; // Clean up expired entries every minute

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

function fallbackIncr(key: string, windowMs: number): number {
  cleanupFallbackStore();

  const now = Date.now();
  const existing = fallbackStore.get(key);

  if (existing && existing.expiresAt > now) {
    existing.count++;
    return existing.count;
  }

  fallbackStore.set(key, { count: 1, expiresAt: now + windowMs });
  return 1;
}

// Track Redis health for logging (avoid log spam)
let redisHealthy = true;
let lastRedisErrorLog = 0;
const ERROR_LOG_INTERVAL = 60_000; // Log Redis errors at most once per minute

function getClientIP(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0];
    if (firstIp) {
      return firstIp.trim();
    }
  }
  const ip = c.env?.ip;
  if (ip?.address) {
    return ip.address;
  }
  return "unknown";
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix = "rl" } = options;
  const windowSeconds = Math.ceil(windowMs / 1000);

  return async (c: Context, next: Next) => {
    const ip = getClientIP(c);
    const key = `${keyPrefix}:${ip}`;

    try {
      const current = await redis.incr(key);

      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }

      // Redis recovered - log once
      if (!redisHealthy) {
        console.info("[rate-limit] Redis connection restored");
        redisHealthy = true;
      }

      c.header("X-RateLimit-Limit", String(maxRequests));
      c.header("X-RateLimit-Remaining", String(Math.max(0, maxRequests - current)));

      if (current > maxRequests) {
        const ttl = await redis.ttl(key);
        c.header("Retry-After", String(ttl > 0 ? ttl : windowSeconds));
        return c.json({ error: "Too many requests" }, 429);
      }

      await next();
    } catch (error) {
      // Redis unavailable - use in-memory fallback rate limiter
      const now = Date.now();
      if (redisHealthy || now - lastRedisErrorLog > ERROR_LOG_INTERVAL) {
        console.warn(
          "[rate-limit] Redis unavailable, using in-memory fallback:",
          error instanceof Error ? error.message : "Unknown error"
        );
        lastRedisErrorLog = now;
        redisHealthy = false;
      }

      const current = fallbackIncr(key, windowMs);

      c.header("X-RateLimit-Limit", String(maxRequests));
      c.header("X-RateLimit-Remaining", String(Math.max(0, maxRequests - current)));
      c.header("X-RateLimit-Fallback", "true");

      if (current > maxRequests) {
        c.header("Retry-After", String(windowSeconds));
        return c.json({ error: "Too many requests" }, 429);
      }

      await next();
    }
  };
}
