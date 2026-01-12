import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, desc, eq, and, or, isNull, sql } from "@amigo/db";
import { transactions, budgets, users } from "@amigo/db/schema";
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

    // Transactions visible to the user:
    // 1. Transactions they own (userId = current user)
    // 2. Transactions linked to a shared budget (budget.userId IS NULL)
    const visibilityCondition = or(
      eq(transactions.userId, session.userId),
      and(
        sql`${transactions.budgetId} IS NOT NULL`,
        sql`EXISTS (
          SELECT 1 FROM ${budgets}
          WHERE ${budgets.id} = ${transactions.budgetId}
          AND ${budgets.userId} IS NULL
        )`
      )
    );

    const conditions = [
      eq(transactions.householdId, session.householdId),
      isNull(transactions.deletedAt),
      visibilityCondition,
    ];

    if (category) {
      conditions.push(eq(transactions.category, category));
    }

    // Left join with budgets to get budget name and users to get user display name
    const data = await db
      .select({
        id: transactions.id,
        householdId: transactions.householdId,
        userId: transactions.userId,
        userDisplayName: transactions.userDisplayName,
        transferredFromUserId: transactions.transferredFromUserId,
        userName: users.name,
        userEmail: users.email,
        budgetId: transactions.budgetId,
        amount: transactions.amount,
        currency: transactions.currency,
        exchangeRateToHome: transactions.exchangeRateToHome,
        category: transactions.category,
        description: transactions.description,
        type: transactions.type,
        date: transactions.date,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
        deletedAt: transactions.deletedAt,
        budgetName: budgets.name,
      })
      .from(transactions)
      .leftJoin(budgets, eq(transactions.budgetId, budgets.id))
      .leftJoin(users, eq(transactions.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(transactions.date))
      .limit(limit)
      .offset(offset);

    // Serialize dates as YYYY-MM-DD strings to avoid timezone issues
    // When Date objects are JSON serialized, they become UTC ISO strings
    // which display as the wrong day in non-UTC timezones
    // Use getUTC* methods since the Date was created from a UTC midnight timestamp
    const serializedData = data.map((t) => {
      // Compute display name: use live user data if available, otherwise fall back to denormalized name
      const createdByDisplayName = t.userName ?? t.userEmail ?? t.userDisplayName ?? "Deleted User";
      const isDeletedUser = !t.userId || (!t.userName && !t.userEmail && !!t.userDisplayName);
      // Track if this record was transferred from another user
      const wasTransferred = !!t.transferredFromUserId;

      return {
        id: t.id,
        householdId: t.householdId,
        userId: t.userId,
        createdByDisplayName,
        isDeletedUser,
        transferredFromUserId: t.transferredFromUserId,
        // Use denormalized display name for transferred records
        transferredFromDisplayName: wasTransferred ? t.userDisplayName : null,
        wasTransferred,
        budgetId: t.budgetId,
        amount: t.amount,
        currency: t.currency,
        exchangeRateToHome: t.exchangeRateToHome,
        category: t.category,
        description: t.description,
        type: t.type,
        date: `${t.date.getUTCFullYear()}-${String(t.date.getUTCMonth() + 1).padStart(2, "0")}-${String(t.date.getUTCDate()).padStart(2, "0")}`,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        deletedAt: t.deletedAt,
        budgetName: t.budgetName,
      };
    });

    return c.json({
      data: serializedData,
      pagination: {
        page,
        limit,
        hasMore: data.length === limit,
      },
    });
  }
);
