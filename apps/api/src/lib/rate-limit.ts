import type { Context, Next } from "hono";
import { redis } from "./redis";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

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

      c.header("X-RateLimit-Limit", String(maxRequests));
      c.header("X-RateLimit-Remaining", String(Math.max(0, maxRequests - current)));

      if (current > maxRequests) {
        const ttl = await redis.ttl(key);
        c.header("Retry-After", String(ttl > 0 ? ttl : windowSeconds));
        return c.json({ error: "Too many requests" }, 429);
      }

      await next();
    } catch {
      // If Redis fails, allow the request (fail open)
      await next();
    }
  };
}
