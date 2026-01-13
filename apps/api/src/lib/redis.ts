import Redis from "ioredis";

const redisUrl = process.env["VALKEY_URL"];
if (!redisUrl) {
  throw new Error("VALKEY_URL environment variable is required");
}

export const redis = new Redis(redisUrl);
export const subscriber = new Redis(redisUrl);

export const CHANNELS = {
  HOUSEHOLD_UPDATES: "household:updates",
  SESSION_INVALIDATIONS: "session:invalidations",
} as const;
