import { Hono } from "hono";
import type { Env } from "../env";
import { getDb } from "@amigo/db";
import { sql } from "drizzle-orm";

type HonoEnv = { Bindings: Env };

export const healthRoute = new Hono<HonoEnv>();

healthRoute.get("/health", async (c) => {
  const checks: Record<string, string> = {};

  // D1 check
  try {
    const db = getDb(c.env.DB);
    await db.run(sql`SELECT 1`);
    checks["d1"] = "ok";
  } catch {
    checks["d1"] = "error";
  }

  // KV check
  try {
    await c.env.CACHE.get("health-check");
    checks["kv"] = "ok";
  } catch {
    checks["kv"] = "error";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");

  return c.json(
    { status: healthy ? "healthy" : "degraded", checks },
    healthy ? 200 : 503
  );
});
