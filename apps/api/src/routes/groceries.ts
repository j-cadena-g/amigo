import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, desc, eq, and, gte, isNull } from "@amigo/db";
import { groceryItems } from "@amigo/db/schema";
import { getSessionFromCookie } from "../lib/session";

const querySchema = z.object({
  lastSync: z.coerce.number().optional(),
});

export const groceriesRouter = new Hono().get(
  "/",
  zValidator("query", querySchema),
  async (c) => {
    const cookieHeader = c.req.header("cookie");
    const session = await getSessionFromCookie(cookieHeader ?? null);

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { lastSync } = c.req.valid("query");

    // Delta sync: fetch items updated after lastSync timestamp
    // Include soft-deleted items so clients can remove them
    // If no lastSync provided, return all active items (initial sync)
    const baseCondition = eq(groceryItems.householdId, session.householdId);

    const data = lastSync
      ? await db
          .select()
          .from(groceryItems)
          .where(
            and(
              baseCondition,
              gte(groceryItems.updatedAt, new Date(lastSync))
            )
          )
          .orderBy(desc(groceryItems.updatedAt))
      : await db
          .select()
          .from(groceryItems)
          .where(
            and(
              baseCondition,
              isNull(groceryItems.deletedAt)
            )
          )
          .orderBy(desc(groceryItems.updatedAt));

    return c.json({
      data,
      syncTimestamp: Date.now(),
      isDelta: !!lastSync,
    });
  }
);
