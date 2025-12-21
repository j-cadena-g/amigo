import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, desc, eq, and, isNull } from "@amigo/db";
import { transactions } from "@amigo/db/schema";
import { getSessionFromCookie } from "../lib/session";

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  category: z.string().optional(),
});

export const transactionsRouter = new Hono().get(
  "/",
  zValidator("query", querySchema),
  async (c) => {
    const cookieHeader = c.req.header("cookie");
    const session = await getSessionFromCookie(cookieHeader ?? null);

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { page, limit, category } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const conditions = [
      eq(transactions.householdId, session.householdId),
      isNull(transactions.deletedAt),
    ];

    if (category) {
      conditions.push(eq(transactions.category, category));
    }

    const data = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date))
      .limit(limit)
      .offset(offset);

    return c.json({
      data,
      pagination: {
        page,
        limit,
        hasMore: data.length === limit,
      },
    });
  }
);
