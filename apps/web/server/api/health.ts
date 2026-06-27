import { getDb } from "@amigo/db";
import { sql } from "drizzle-orm";
import type { ApiHandler } from "./route";

export const handleHealthRequest: ApiHandler = async ({ env, request }) => {
  if (request.method !== "GET") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  const checks: Record<string, string> = {};

  try {
    const db = getDb(env.DB);
    await db.run(sql`SELECT 1`);
    checks["d1"] = "ok";
  } catch {
    checks["d1"] = "error";
  }

  try {
    await env.CACHE.get("health-check");
    checks["kv"] = "ok";
  } catch {
    checks["kv"] = "error";
  }

  const healthy = Object.values(checks).every((value) => value === "ok");

  return Response.json(
    { status: healthy ? "healthy" : "degraded", checks },
    { status: healthy ? 200 : 503 }
  );
};
