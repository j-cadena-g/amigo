import Redis from "ioredis";

function getRedis(): Redis {
  const redisUrl = process.env["VALKEY_URL"];
  if (!redisUrl) {
    throw new Error("VALKEY_URL environment variable is required");
  }
  return new Redis(redisUrl);
}

// Lazy initialization to avoid build-time errors
let _redis: Redis | null = null;
export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    if (!_redis) {
      _redis = getRedis();
    }
    const value = _redis[prop as keyof Redis];
    if (typeof value === "function") {
      return value.bind(_redis);
    }
    return value;
  },
});

export const CHANNELS = {
  HOUSEHOLD_UPDATES: "household:updates",
  SESSION_INVALIDATIONS: "session:invalidations",
} as const;

export type UpdateAction = "create" | "update" | "delete";

export interface HouseholdUpdatePayload {
  householdId: string;
  type: "GROCERY_UPDATE" | "TRANSACTION_UPDATE" | "RECURRING_UPDATE";
  /** The action that triggered this update */
  action?: UpdateAction;
  /** The affected entity ID(s) */
  entityId?: string | string[];
  /** Optional full entity data for create/update (avoids refetch) */
  data?: unknown;
}

export async function publishHouseholdUpdate(
  payload: HouseholdUpdatePayload
): Promise<void> {
  await redis.publish(CHANNELS.HOUSEHOLD_UPDATES, JSON.stringify(payload));
}

export async function publishSessionInvalidation(sessionId: string): Promise<void> {
  await redis.publish(CHANNELS.SESSION_INVALIDATIONS, JSON.stringify({ sessionId }));
}
