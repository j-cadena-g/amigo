import {
  and,
  budgets,
  eq,
  getDb,
  households,
  isNull,
  or,
  scopeToHousehold,
  sql,
  transactions,
} from "@amigo/db";
import type { CurrencyCode } from "@amigo/db";
import { z } from "zod";
import { broadcastToHousehold } from "../lib/realtime";
import { ActionError } from "../lib/errors";
import { toCents, toISODate } from "../lib/conversions";
import { getExchangeRateForRecord } from "../lib/exchange-rates";
import { parseTransactionsListQuery } from "../lib/request-validation";
import { withAudit } from "../lib/audit";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatSegments, type ApiHandler } from "./route";

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

async function getHomeCurrency(
  db: ReturnType<typeof getDb>,
  householdId: string
): Promise<CurrencyCode> {
  const household = await db.query.households.findFirst({
    where: eq(households.id, householdId),
  });
  return (household?.homeCurrency as CurrencyCode) ?? "CAD";
}

export const handleTransactionsRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const [id] = getSplatSegments(params);
  const db = getDb(env.DB);

  if (request.method === "GET" && !id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:transactions:list`,
      ROUTE_RATE_LIMITS.transactions.list
    );

    const url = new URL(request.url);
    const { page, limit, type } = parseTransactionsListQuery({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
    });
    const offset = (page - 1) * limit;

    const conditions = [
      scopeToHousehold(transactions.householdId, session!.householdId),
      isNull(transactions.deletedAt),
      or(
        eq(transactions.userId, session!.userId),
        sql`EXISTS (SELECT 1 FROM budgets WHERE budgets.id = ${transactions.budgetId} AND budgets.user_id IS NULL)`
      ),
    ];

    if (type) {
      conditions.push(eq(transactions.type, type));
    }

    const items = await db.query.transactions.findMany({
      where: and(...conditions),
      orderBy: (transaction, { desc }) => [
        desc(transaction.date),
        desc(transaction.createdAt),
      ],
      limit: limit + 1,
      offset,
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;

    return Response.json({
      data,
      pagination: { page, limit, hasMore },
    });
  }

  if (request.method === "POST" && !id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:transactions:add`,
      ROUTE_RATE_LIMITS.transactions.create
    );

    const validated = addTransactionSchema.parse(await request.json());
    const currency = validated.currency ?? "CAD";
    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const exchangeRateToHome = await getExchangeRateForRecord(
      env,
      currency,
      homeCurrency
    );
    const transactionId = crypto.randomUUID();

    const transaction = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "transactions",
        recordId: transactionId,
        operation: "INSERT",
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .insert(transactions)
          .values({
            id: transactionId,
            householdId: session!.householdId,
            userId: session!.userId,
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

    await broadcastToHousehold(env, session!.householdId, {
      type: "TRANSACTION_UPDATE",
      action: "create",
      entityId: transaction.id,
    });

    return Response.json(transaction, { status: 201 });
  }

  if (request.method === "PATCH" && id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:transactions:update`,
      ROUTE_RATE_LIMITS.transactions.update
    );

    const validated = updateTransactionSchema.parse(await request.json());
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
      const homeCurrency = await getHomeCurrency(db, session!.householdId);
      updateData.exchangeRateToHome = await getExchangeRateForRecord(
        env,
        validated.currency,
        homeCurrency
      );
    }

    const visibilityCondition = or(
      eq(transactions.userId, session!.userId),
      sql`EXISTS (
        SELECT 1 FROM ${budgets}
        WHERE ${budgets.id} = ${transactions.budgetId}
        AND ${budgets.userId} IS NULL
      )`
    );

    const existing = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.id, id),
        scopeToHousehold(transactions.householdId, session!.householdId),
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
        householdId: session!.householdId,
        tableName: "transactions",
        recordId: id,
        operation: "UPDATE",
        oldValues: existing,
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(transactions)
          .set(updateData)
          .where(
            and(
              eq(transactions.id, id),
              scopeToHousehold(transactions.householdId, session!.householdId),
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

    await broadcastToHousehold(env, session!.householdId, {
      type: "TRANSACTION_UPDATE",
      action: "update",
      entityId: id,
    });

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:transactions:delete`,
      ROUTE_RATE_LIMITS.transactions.delete
    );

    const visibilityCondition = or(
      eq(transactions.userId, session!.userId),
      sql`EXISTS (
        SELECT 1 FROM ${budgets}
        WHERE ${budgets.id} = ${transactions.budgetId}
        AND ${budgets.userId} IS NULL
      )`
    );

    const existing = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.id, id),
        scopeToHousehold(transactions.householdId, session!.householdId),
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
        householdId: session!.householdId,
        tableName: "transactions",
        recordId: id,
        operation: "DELETE",
        oldValues: existing,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(transactions)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(transactions.id, id),
              scopeToHousehold(transactions.householdId, session!.householdId),
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

    await broadcastToHousehold(env, session!.householdId, {
      type: "TRANSACTION_UPDATE",
      action: "delete",
      entityId: id,
    });

    return Response.json(deleted);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
