import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, desc, isNull } from "@amigo/db";
import { groceryItems } from "@amigo/db/schema";

const querySchema = z.object({
  lastSync: z.coerce.number().optional(),
});

export const groceriesRouter = new Hono().get(
  "/",
  zValidator("query", querySchema),
  async (c) => {
    const { lastSync } = c.req.valid("query");

    // Delta sync: fetch items updated after lastSync timestamp
    const query = db
      .select()
      .from(groceryItems)
      .orderBy(desc(groceryItems.updatedAt));

    // If lastSync provided, only get items updated after that time
    // For now, return all non-deleted items (delta sync will be enhanced in Phase 4)
    const data = await query.where(isNull(groceryItems.deletedAt));

    return c.json({
      data,
      syncTimestamp: Date.now(),
    });
  }
);
