import { Hono } from "hono";
import { db, sql } from "@amigo/db";
import { checkRedisHealth } from "../lib/redis";

interface HealthCheckResult {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  services: {
    postgres: { status: "ok" | "error"; latencyMs?: number; error?: string };
    valkey: { status: "ok" | "degraded" | "error"; latencyMs?: number; error?: string };
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

  // Check Valkey connectivity using new health check function
  const valkeyHealth = await checkRedisHealth();
  result.services.valkey.status = valkeyHealth.status === "healthy" ? "ok" : valkeyHealth.status;

  if (valkeyHealth.latency !== undefined) {
    result.services.valkey.latencyMs = valkeyHealth.latency;
  }

  if (valkeyHealth.error) {
    result.services.valkey.error = valkeyHealth.error;
  }

  // Determine overall status
  if (result.services.postgres.status === "error") {
    result.status = "error";
  } else if (valkeyHealth.status === "error") {
    result.status = "error";
  } else if (valkeyHealth.status === "degraded") {
    result.status = "degraded";
  }

  // Return 503 only for critical errors (postgres down)
  // Return 200 for degraded mode (valkey down but postgres ok)
  const statusCode = result.services.postgres.status === "error" ? 503 : 200;
  return c.json(result, statusCode);
});
