import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, desc } from "@amigo/db";
import { transactions } from "@amigo/db/schema";

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const transactionsRouter = new Hono().get(
  "/",
  zValidator("query", querySchema),
  async (c) => {
    const { page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const data = await db
      .select()
      .from(transactions)
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
