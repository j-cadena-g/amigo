import Redis from "ioredis";

const redisUrl = process.env["VALKEY_URL"] ?? "redis://192.168.15.32:6379";

export const redis = new Redis(redisUrl);
