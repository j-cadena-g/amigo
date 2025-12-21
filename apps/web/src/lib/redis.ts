import Redis from "ioredis";

const redisUrl = process.env["VALKEY_URL"] ?? "redis://192.168.15.32:6379";

export const redis = new Redis(redisUrl);

export const CHANNELS = {
  HOUSEHOLD_UPDATES: "household:updates",
} as const;

export interface HouseholdUpdatePayload {
  householdId: string;
  type: "GROCERY_UPDATE" | "TRANSACTION_UPDATE";
  data?: unknown;
}

export async function publishHouseholdUpdate(
  payload: HouseholdUpdatePayload
): Promise<void> {
  await redis.publish(CHANNELS.HOUSEHOLD_UPDATES, JSON.stringify(payload));
}
