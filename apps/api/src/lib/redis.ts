import Redis from "ioredis";

const redisUrl = process.env["VALKEY_URL"];

// Track connection state for graceful degradation
let isConnected = false;
let connectionError: Error | null = null;

/**
 * Create a Redis client with reconnection and error handling
 */
function createRedisClient(name: string): Redis | null {
  if (!redisUrl) {
    console.warn(
      `[${name}] VALKEY_URL not set - Redis features will be disabled`
    );
    return null;
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 1000, 30000); // Max 30 seconds
      console.log(`[${name}] Redis reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    lazyConnect: true, // Don't connect immediately
  });

  client.on("connect", () => {
    console.log(`[${name}] Redis connected`);
    isConnected = true;
    connectionError = null;
  });

  client.on("ready", () => {
    console.log(`[${name}] Redis ready`);
    isConnected = true;
  });

  client.on("error", (err) => {
    console.error(`[${name}] Redis error:`, err.message);
    connectionError = err;
  });

  client.on("close", () => {
    console.log(`[${name}] Redis connection closed`);
    isConnected = false;
  });

  client.on("reconnecting", () => {
    console.log(`[${name}] Redis reconnecting...`);
  });

  return client;
}

// Create clients (may be null if VALKEY_URL not set)
const _redis = createRedisClient("redis");
const _subscriber = createRedisClient("subscriber");

/**
 * Proxy that provides null-safe access to Redis
 * Operations fail gracefully when Redis is unavailable
 */
export const redis = new Proxy({} as Redis, {
  get(_target, prop: string) {
    if (!_redis) {
      // Return no-op functions for common methods
      if (["get", "set", "setex", "del", "exists", "incr", "expire", "ttl", "ping"].includes(prop)) {
        return async () => {
          console.warn(`[redis] Operation '${prop}' skipped - Redis unavailable`);
          return null;
        };
      }
      return undefined;
    }
    return (_redis as unknown as Record<string, unknown>)[prop];
  },
});

export const subscriber = new Proxy({} as Redis, {
  get(_target, prop: string) {
    if (!_subscriber) {
      // Return no-op functions for common methods
      if (["subscribe", "on", "off"].includes(prop)) {
        return (...args: unknown[]) => {
          console.warn(`[subscriber] Operation '${prop}' skipped - Redis unavailable`);
          // Return subscriber for chaining
          return subscriber;
        };
      }
      return undefined;
    }
    return (_subscriber as unknown as Record<string, unknown>)[prop];
  },
});

export const CHANNELS = {
  HOUSEHOLD_UPDATES: "household:updates",
  SESSION_INVALIDATIONS: "session:invalidations",
} as const;

/**
 * Check if Redis is currently available
 */
export function isRedisAvailable(): boolean {
  return _redis !== null && isConnected;
}

/**
 * Get the last connection error (if any)
 */
export function getRedisError(): Error | null {
  return connectionError;
}

/**
 * Attempt to connect to Redis (call during startup)
 * Returns true if connected, false otherwise
 */
export async function connectRedis(): Promise<boolean> {
  if (!_redis || !_subscriber) {
    return false;
  }

  try {
    // Connect both clients
    await Promise.all([_redis.connect(), _subscriber.connect()]);
    return true;
  } catch (err) {
    console.error("[redis] Failed to connect:", (err as Error).message);
    connectionError = err as Error;
    return false;
  }
}

/**
 * Check Redis health (for health endpoint)
 */
export async function checkRedisHealth(): Promise<{
  status: "healthy" | "degraded" | "error";
  latency?: number;
  error?: string;
}> {
  if (!_redis) {
    return { status: "degraded", error: "Redis not configured" };
  }

  if (!isConnected) {
    return { status: "error", error: connectionError?.message || "Not connected" };
  }

  try {
    const start = Date.now();
    await _redis.ping();
    const latency = Date.now() - start;
    return { status: "healthy", latency };
  } catch (err) {
    return { status: "error", error: (err as Error).message };
  }
}
