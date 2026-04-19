import {
  and,
  budgets,
  eq,
  getDb,
  gte,
  isNull,
  lte,
  or,
  scopeToHousehold,
  sql,
  transactions,
} from "@amigo/db";
import { z } from "zod";
import { ActionError } from "../lib/errors";
import { assertPermission, canManageSharedBudgets } from "../lib/permissions";
import { toCents, toISODate } from "../lib/conversions";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatSegments, type ApiHandler } from "./route";

const budgetSchema = z.object({
  name: z.string().min(1),
  category: z.string().nullable().optional(),
  limitAmount: z.number().positive(),
  period: z.enum(["weekly", "monthly", "yearly"]),
  isShared: z.boolean(),
  currency: z.enum(["CAD", "USD", "EUR", "GBP", "MXN"]).optional(),
});

function getPeriodBounds(period: "weekly" | "monthly" | "yearly") {
  const now = new Date();
  let start: Date;
  let end: Date;

  switch (period) {
    case "weekly": {
      const dayOfWeek = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "monthly": {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "yearly": {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    }
  }

  return { start, end };
}

export const handleBudgetsRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const [path] = getSplatSegments(params);
  const id = path && path !== "with-spending" ? path : undefined;
  const db = getDb(env.DB);

  if (request.method === "GET" && !path) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:budgets:list`,
      ROUTE_RATE_LIMITS.budgets.list
    );

    const userBudgets = await db.query.budgets.findMany({
      where: and(
        scopeToHousehold(budgets.householdId, session!.householdId),
        or(eq(budgets.userId, session!.userId), isNull(budgets.userId)),
        isNull(budgets.deletedAt)
      ),
      orderBy: (budget, { asc }) => [asc(budget.category)],
    });

    return Response.json(
      userBudgets.map((budget) => ({
        ...budget,
        isShared: budget.userId === null,
      }))
    );
  }

  if (request.method === "GET" && path === "with-spending") {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:budgets:with-spending`,
      ROUTE_RATE_LIMITS.budgets.withSpending
    );

    const userBudgets = await db.query.budgets.findMany({
      where: and(
        scopeToHousehold(budgets.householdId, session!.householdId),
        or(eq(budgets.userId, session!.userId), isNull(budgets.userId)),
        isNull(budgets.deletedAt)
      ),
      orderBy: (budget, { desc }) => [desc(budget.createdAt)],
    });

    const budgetsWithSpending = await Promise.all(
      userBudgets.map(async (budget) => {
        const { start, end } = getPeriodBounds(budget.period);
        const isShared = budget.userId === null;

        const baseConditions = [
          eq(transactions.budgetId, budget.id),
          scopeToHousehold(transactions.householdId, session!.householdId),
          eq(transactions.type, "expense"),
          isNull(transactions.deletedAt),
          gte(transactions.date, toISODate(start)),
          lte(transactions.date, toISODate(end)),
        ];

        if (!isShared && budget.userId) {
          baseConditions.push(eq(transactions.userId, budget.userId));
        }

        const spendingResult = await db
          .select({
            total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
          })
          .from(transactions)
          .where(and(...baseConditions));

        const currentSpendingCents = spendingResult[0]?.total ?? 0;
        const limitCents = budget.limitAmount;
        const percentUsed =
          limitCents > 0 ? (currentSpendingCents / limitCents) * 100 : 0;
        const remainingCents = Math.max(0, limitCents - currentSpendingCents);

        return {
          ...budget,
          isShared,
          currentSpending: currentSpendingCents,
          percentUsed,
          remainingAmount: remainingCents,
        };
      })
    );

    return Response.json(budgetsWithSpending);
  }

  if (request.method === "POST" && !path) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:budgets:create`,
      ROUTE_RATE_LIMITS.budgets.create
    );

    const validated = budgetSchema.parse(await request.json());
    if (validated.isShared) {
      assertPermission(
        canManageSharedBudgets(session!),
        "Only owners and admins can create shared budgets"
      );
    }

    const budget = await db
      .insert(budgets)
      .values({
        householdId: session!.householdId,
        userId: validated.isShared ? null : session!.userId,
        name: validated.name.trim(),
        category: validated.category?.trim() || null,
        limitAmount: toCents(validated.limitAmount),
        currency: validated.currency ?? "CAD",
        period: validated.period,
      })
      .returning()
      .get();

    return Response.json(budget, { status: 201 });
  }

  if (request.method === "PATCH" && id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:budgets:update`,
      ROUTE_RATE_LIMITS.budgets.update
    );

    const validated = budgetSchema.parse(await request.json());
    const existing = await db.query.budgets.findFirst({
      where: and(
        eq(budgets.id, id),
        scopeToHousehold(budgets.householdId, session!.householdId),
        isNull(budgets.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Budget not found", "NOT_FOUND");
    }

    const isCurrentlyShared = existing.userId === null;
    if (isCurrentlyShared || validated.isShared) {
      assertPermission(
        canManageSharedBudgets(session!),
        "Only owners and admins can modify shared budgets"
      );
    } else if (existing.userId !== session!.userId) {
      throw new ActionError(
        "Cannot modify another user's personal budget",
        "PERMISSION_DENIED"
      );
    }

    const updated = await db
      .update(budgets)
      .set({
        userId: validated.isShared ? null : session!.userId,
        name: validated.name.trim(),
        category: validated.category?.trim() || null,
        limitAmount: toCents(validated.limitAmount),
        currency: validated.currency ?? "CAD",
        period: validated.period,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(budgets.id, id),
          scopeToHousehold(budgets.householdId, session!.householdId)
        )
      )
      .returning()
      .get();

    if (!updated) {
      throw new ActionError("Budget not found", "NOT_FOUND");
    }

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:budgets:delete`,
      ROUTE_RATE_LIMITS.budgets.delete
    );

    const existing = await db.query.budgets.findFirst({
      where: and(
        eq(budgets.id, id),
        scopeToHousehold(budgets.householdId, session!.householdId),
        isNull(budgets.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Budget not found", "NOT_FOUND");
    }

    const isShared = existing.userId === null;
    if (isShared) {
      assertPermission(
        canManageSharedBudgets(session!),
        "Only owners and admins can delete shared budgets"
      );
    } else if (existing.userId !== session!.userId) {
      throw new ActionError(
        "Cannot delete another user's personal budget",
        "PERMISSION_DENIED"
      );
    }

    const deleted = await db
      .update(budgets)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(budgets.id, id),
          scopeToHousehold(budgets.householdId, session!.householdId)
        )
      )
      .returning()
      .get();

    return Response.json(deleted);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
