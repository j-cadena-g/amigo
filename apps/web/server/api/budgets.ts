import {
  and,
  budgets,
  eq,
  getDb,
  isNull,
  or,
  recurringTransactions,
  scopeToHousehold,
  visibleRecurringRulesCondition,
} from "@amigo/db";
import { z } from "zod";
import { ActionError, logSecurityEvent } from "../lib/errors";
import { assertPermission, canManageSharedBudgets } from "../lib/permissions";
import {
  isExplicitAdminTakeover,
  resolveFinancialObjectUserId,
} from "../lib/financial-object-permissions";
import { toCents } from "../lib/conversions";
import { computeLimitAmountHomeCents } from "../lib/money";
import { withAudit } from "../lib/audit";
import { getBudgetsWithSpending } from "../lib/budget-spending";
import { getHomeCurrency } from "../lib/household-currency";
import { getHouseholdTimezone } from "../lib/household-timezone";
import { findBudgetIdForCategory } from "../lib/financial-categories";
import { zCurrencyCode } from "../lib/request-validation";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatSegments, type ApiHandler } from "./route";

const budgetSchema = z.object({
  name: z.string().min(1),
  limitAmount: z.number().positive(),
  period: z.enum(["weekly", "monthly", "yearly"]),
  isShared: z.boolean(),
  adminTakeover: z.boolean().optional(),
  currency: zCurrencyCode.optional(),
});

export const handleBudgetsRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const [path] = getSplatSegments(params);
  const id =
    path && path !== "with-spending" && path !== "match-category" ? path : undefined;
  const db = getDb(env.DB);

  if (request.method === "GET" && !path) {
    await enforceRateLimit(
      env,
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

  if (request.method === "GET" && path === "match-category") {
    await enforceRateLimit(
      env,
      `${session!.userId}:budgets:match-category`,
      ROUTE_RATE_LIMITS.budgets.matchCategory
    );

    const url = new URL(request.url);
    const categoryId = url.searchParams.get("categoryId")?.trim() ?? "";
    const category = url.searchParams.get("category")?.trim() ?? "";
    const recurringRuleId = url.searchParams.get("recurringRuleId")?.trim();

    if (recurringRuleId) {
      const rule = await db.query.recurringTransactions.findFirst({
        where: and(
          eq(recurringTransactions.id, recurringRuleId),
          scopeToHousehold(recurringTransactions.householdId, session!.householdId),
          visibleRecurringRulesCondition(session!.userId),
          isNull(recurringTransactions.deletedAt)
        ),
      });
      if (rule?.budgetId) {
        return Response.json({ budgetId: rule.budgetId, matchSource: "recurring" });
      }
    }

    if (categoryId) {
      const match = await findBudgetIdForCategory(
        db,
        session!.householdId,
        session!.userId,
        categoryId
      );
      return Response.json(match);
    }

    if (!category) {
      return Response.json({ budgetId: null, matchSource: null });
    }

    const needle = category.toLowerCase();
    const candidates = await db.query.budgets.findMany({
      where: and(
        scopeToHousehold(budgets.householdId, session!.householdId),
        or(eq(budgets.userId, session!.userId), isNull(budgets.userId)),
        isNull(budgets.deletedAt)
      ),
    });

    const match = candidates
      .filter((b) => (b.category ?? "").trim().toLowerCase() === needle)
      .sort((a, b) => (a.userId === null ? 1 : 0) - (b.userId === null ? 1 : 0))[0];

    return Response.json({
      budgetId: match?.id ?? null,
      matchSource: match ? "category" : null,
    });
  }

  if (request.method === "GET" && path === "with-spending") {
    await enforceRateLimit(
      env,
      `${session!.userId}:budgets:with-spending`,
      ROUTE_RATE_LIMITS.budgets.withSpending
    );

    const legacyRemaining =
      request.headers.get("x-api-version") === "1" ||
      new URL(request.url).searchParams.get("api_version") === "1";

    const timeZone = await getHouseholdTimezone(db, session!.householdId);
    const budgetsWithSpending = await getBudgetsWithSpending(db, {
      householdId: session!.householdId,
      viewerUserId: session!.userId,
      timeZone,
      legacyRemaining,
    });

    return Response.json(budgetsWithSpending);
  }

  if (request.method === "POST" && !path) {
    await enforceRateLimit(
      env,
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

    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const currency = validated.currency ?? homeCurrency;
    const limitCents = toCents(validated.limitAmount);
    const { limitAmountHome, exchangeRateLimitToHome } =
      await computeLimitAmountHomeCents(
        env,
        db,
        session!.householdId,
        limitCents,
        currency
      );

    const budgetId = crypto.randomUUID();
    const budget = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "budgets",
        recordId: budgetId,
        operation: "INSERT",
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .insert(budgets)
          .values({
            id: budgetId,
            householdId: session!.householdId,
            userId: validated.isShared ? null : session!.userId,
            name: validated.name.trim(),
            limitAmount: limitCents,
            limitAmountHome,
            exchangeRateLimitToHome,
            currency,
            period: validated.period,
          })
          .returning()
          .get()
    );

    return Response.json(budget, { status: 201 });
  }

  if (request.method === "PATCH" && id) {
    await enforceRateLimit(
      env,
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

    const nextUserId = resolveFinancialObjectUserId({
      session: session!,
      existingUserId: existing.userId,
      requestedIsShared: validated.isShared,
      adminTakeover: validated.adminTakeover,
      canManageShared: canManageSharedBudgets(session!),
      objectName: "budget",
    });
    const adminTakeover = isExplicitAdminTakeover({
      session: session!,
      existingUserId: existing.userId,
      requestedIsShared: validated.isShared,
      adminTakeover: validated.adminTakeover,
    });

    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const currency = validated.currency ?? homeCurrency;
    const limitCents = toCents(validated.limitAmount);
    const { limitAmountHome, exchangeRateLimitToHome } =
      await computeLimitAmountHomeCents(
        env,
        db,
        session!.householdId,
        limitCents,
        currency
      );

    const updated = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "budgets",
        recordId: id,
        operation: "UPDATE",
        oldValues: existing,
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(budgets)
          .set({
            userId: nextUserId,
            name: validated.name.trim(),
            limitAmount: limitCents,
            limitAmountHome,
            exchangeRateLimitToHome,
            currency,
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
          .get()
    );

    if (!updated) {
      throw new ActionError("Budget not found", "NOT_FOUND");
    }

    if (adminTakeover) {
      logSecurityEvent("personal_financial_object_takeover", {
        tableName: "budgets",
        recordId: id,
        previousUserId: existing.userId,
        changedBy: session!.userId,
        householdId: session!.householdId,
      });
    }

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id) {
    await enforceRateLimit(
      env,
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

    const deleted = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "budgets",
        recordId: id,
        operation: "DELETE",
        oldValues: existing,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(budgets)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(budgets.id, id),
              scopeToHousehold(budgets.householdId, session!.householdId)
            )
          )
          .returning()
          .get()
    );

    return Response.json(deleted);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
