import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../env";
import { getDb, transactions, budgets, households, scopeToHousehold, eq, and, or, isNull, sql } from "@amigo/db";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { broadcastToHousehold } from "../lib/realtime";
import { ActionError } from "../lib/errors";
import { toCents, toISODate } from "../lib/conversions";
import { getExchangeRateForRecord } from "../lib/exchange-rates";
import type { CurrencyCode } from "@amigo/db";
import { parseTransactionsListQuery } from "../lib/request-validation";
import { withAudit } from "../lib/audit";

const currencyEnum = z.enum(["CAD", "USD", "EUR", "GBP", "MXN"]);

const addTransactionSchema = z.object({
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
  category: z.string().min(1).max(100),
  type: z.enum(["income", "expense"]),
  date: z.coerce.date(),
  budgetId: z.string().uuid().nullable().optional(),
  currency: currencyEnum.optional(),
});

const updateTransactionSchema = z.object({
  amount: z.number().positive().optional(),
  description: z.string().max(500).nullable().optional(),
  category: z.string().min(1).max(100).optional(),
  type: z.enum(["income", "expense"]).optional(),
  date: z.coerce.date().optional(),
  budgetId: z.string().uuid().nullable().optional(),
  currency: currencyEnum.optional(),
});

export const transactionsRoute = new Hono<HonoEnv>();

async function getHomeCurrency(db: ReturnType<typeof getDb>, householdId: string): Promise<CurrencyCode> {
  const household = await db.query.households.findFirst({
    where: eq(households.id, householdId),
  });
  return (household?.homeCurrency as CurrencyCode) ?? "CAD";
}

// List transactions (paginated)
transactionsRoute.get("/", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:transactions:list`,
    ROUTE_RATE_LIMITS.transactions.list
  );

  const db = getDb(c.env.DB);
  const { page, limit, type } = parseTransactionsListQuery({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
    type: c.req.query("type"),
  });
  const offset = (page - 1) * limit;

  const conditions = [
    scopeToHousehold(transactions.householdId, session.householdId),
    isNull(transactions.deletedAt),
    or(
      eq(transactions.userId, session.userId),
      sql`EXISTS (SELECT 1 FROM budgets WHERE budgets.id = ${transactions.budgetId} AND budgets.user_id IS NULL)`
    ),
  ];

  if (type) {
    conditions.push(eq(transactions.type, type));
  }

  const items = await db.query.transactions.findMany({
    where: and(...conditions),
    orderBy: (t, { desc }) => [desc(t.date), desc(t.createdAt)],
    limit: limit + 1,
    offset,
  });

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;

  return c.json({
    data,
    pagination: { page, limit, hasMore },
  });
});

// Add transaction
transactionsRoute.post("/", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:transactions:add`,
    ROUTE_RATE_LIMITS.transactions.create
  );

  const body = await c.req.json();
  const validated = addTransactionSchema.parse(body);
  const db = getDb(c.env.DB);

  const currency = validated.currency ?? "CAD";
  const homeCurrency = await getHomeCurrency(db, session.householdId);
  const exchangeRateToHome = await getExchangeRateForRecord(c.env, currency, homeCurrency);
  const transactionId = crypto.randomUUID();

  const transaction = await withAudit(
    db,
    {
      householdId: session.householdId,
      tableName: "transactions",
      recordId: transactionId,
      operation: "INSERT",
      newValues: (result: typeof transaction) => result,
      changedBy: session.userId,
    },
    async () =>
      db
        .insert(transactions)
        .values({
          id: transactionId,
          householdId: session.householdId,
          userId: session.userId,
          amount: toCents(validated.amount),
          currency,
          exchangeRateToHome,
          description: validated.description?.trim() || null,
          category: validated.category.trim(),
          type: validated.type,
          date: toISODate(validated.date),
          budgetId: validated.budgetId || null,
        })
        .returning()
        .get()
  );

  await broadcastToHousehold(c.env, session.householdId, {
    type: "TRANSACTION_UPDATE",
    action: "create",
    entityId: transaction.id,
  });

  return c.json(transaction, 201);
});

// Update transaction
transactionsRoute.patch("/:id", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:transactions:update`,
    ROUTE_RATE_LIMITS.transactions.update
  );

  const id = c.req.param("id");
  const body = await c.req.json();
  const validated = updateTransactionSchema.parse(body);
  const db = getDb(c.env.DB);

  const updateData: Record<string, unknown> = {};

  if (validated.amount !== undefined) {
    updateData.amount = toCents(validated.amount);
  }
  if (validated.description !== undefined) {
    updateData.description = validated.description?.trim() || null;
  }
  if (validated.category !== undefined) {
    updateData.category = validated.category.trim();
  }
  if (validated.type !== undefined) {
    updateData.type = validated.type;
  }
  if (validated.date !== undefined) {
    updateData.date = toISODate(validated.date);
  }
  if (validated.budgetId !== undefined) {
    updateData.budgetId = validated.budgetId || null;
  }
  if (validated.currency !== undefined) {
    updateData.currency = validated.currency;
    const homeCurrency = await getHomeCurrency(db, session.householdId);
    updateData.exchangeRateToHome = await getExchangeRateForRecord(c.env, validated.currency, homeCurrency);
  }

  // User can update their own transactions, or transactions linked to shared budgets
  const visibilityCondition = or(
    eq(transactions.userId, session.userId),
    sql`EXISTS (
      SELECT 1 FROM ${budgets}
      WHERE ${budgets.id} = ${transactions.budgetId}
      AND ${budgets.userId} IS NULL
    )`
  );

  const existing = await db.query.transactions.findFirst({
    where: and(
      eq(transactions.id, id),
      scopeToHousehold(transactions.householdId, session.householdId),
      isNull(transactions.deletedAt),
      visibilityCondition
    ),
  });

  if (!existing) {
    throw new ActionError("Transaction not found", "NOT_FOUND");
  }

  const updated = await withAudit(
    db,
    {
      householdId: session.householdId,
      tableName: "transactions",
      recordId: id,
      operation: "UPDATE",
      oldValues: existing,
      newValues: (result: typeof updated) => result,
      changedBy: session.userId,
    },
    async () =>
      db
        .update(transactions)
        .set(updateData)
        .where(
          and(
            eq(transactions.id, id),
            scopeToHousehold(transactions.householdId, session.householdId),
            isNull(transactions.deletedAt),
            visibilityCondition
          )
        )
        .returning()
        .get()
  );

  if (!updated) {
    throw new ActionError("Transaction not found", "NOT_FOUND");
  }

  await broadcastToHousehold(c.env, session.householdId, {
    type: "TRANSACTION_UPDATE",
    action: "update",
    entityId: id,
  });

  return c.json(updated);
});

// Delete transaction (soft)
transactionsRoute.delete("/:id", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:transactions:delete`,
    ROUTE_RATE_LIMITS.transactions.delete
  );

  const id = c.req.param("id");
  const db = getDb(c.env.DB);

  const visibilityCondition = or(
    eq(transactions.userId, session.userId),
    sql`EXISTS (
      SELECT 1 FROM ${budgets}
      WHERE ${budgets.id} = ${transactions.budgetId}
      AND ${budgets.userId} IS NULL
    )`
  );

  const existing = await db.query.transactions.findFirst({
    where: and(
      eq(transactions.id, id),
      scopeToHousehold(transactions.householdId, session.householdId),
      isNull(transactions.deletedAt),
      visibilityCondition
    ),
  });

  if (!existing) {
    throw new ActionError("Transaction not found", "NOT_FOUND");
  }

  const deleted = await withAudit(
    db,
    {
      householdId: session.householdId,
      tableName: "transactions",
      recordId: id,
      operation: "DELETE",
      oldValues: existing,
      newValues: (result: typeof deleted) => result,
      changedBy: session.userId,
    },
    async () =>
      db
        .update(transactions)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(transactions.id, id),
            scopeToHousehold(transactions.householdId, session.householdId),
            isNull(transactions.deletedAt),
            visibilityCondition
          )
        )
        .returning()
        .get()
  );

  if (!deleted) {
    throw new ActionError("Transaction not found", "NOT_FOUND");
  }

  await broadcastToHousehold(c.env, session.householdId, {
    type: "TRANSACTION_UPDATE",
    action: "delete",
    entityId: id,
  });

  return c.json(deleted);
});
