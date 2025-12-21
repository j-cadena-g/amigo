import { Hono } from "hono";
import { db, sql } from "@amigo/db";
import { redis } from "../lib/redis";

interface HealthCheckResult {
  status: "ok" | "error";
  timestamp: string;
  services: {
    postgres: { status: "ok" | "error"; latencyMs?: number; error?: string };
    valkey: { status: "ok" | "error"; latencyMs?: number; error?: string };
  };
}

export const healthRouter = new Hono().get("/", async (c) => {
  const result: HealthCheckResult = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      postgres: { status: "ok" },
      valkey: { status: "ok" },
    },
  };

  // Check Postgres connectivity
  const pgStart = performance.now();
  try {
    await db.execute(sql`SELECT 1`);
    result.services.postgres.latencyMs = Math.round(performance.now() - pgStart);
  } catch (error) {
    result.status = "error";
    result.services.postgres.status = "error";
    result.services.postgres.error =
      error instanceof Error ? error.message : "Unknown error";
  }

  // Check Valkey connectivity
  const valkeyStart = performance.now();
  try {
    const pong = await redis.ping();
    if (pong !== "PONG") {
      throw new Error(`Unexpected response: ${pong}`);
    }
    result.services.valkey.latencyMs = Math.round(
      performance.now() - valkeyStart
    );
  } catch (error) {
    result.status = "error";
    result.services.valkey.status = "error";
    result.services.valkey.error =
      error instanceof Error ? error.message : "Unknown error";
  }

  const statusCode = result.status === "ok" ? 200 : 503;
  return c.json(result, statusCode);
});
