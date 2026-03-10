import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { getDb, households, eq } from "@amigo/db";

export const settingsRoute = new Hono<HonoEnv>();

// Get household info
settingsRoute.get("/", async (c) => {
  const session = c.get("appSession");
  const db = getDb(c.env.DB);

  const household = await db.query.households.findFirst({
    where: eq(households.id, session.householdId),
  });

  return c.json(household);
});
