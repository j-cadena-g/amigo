import {
  and,
  eq,
  getDb,
  recurringTransactions,
  scopeToHousehold,
  sql,
  visibleRecurringRulesCondition,
} from "@amigo/db";
import { z } from "zod";
import { broadcastToHousehold } from "../lib/realtime";
import { ActionError } from "../lib/errors";
import { toCents, toISODate } from "../lib/conversions";
import { getInitialNextRunDate, processDueRecurringRules } from "../lib/recurring-processor";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatPath, getSplatSegments, type ApiHandler } from "./route";

const createRuleSchema = z.object({
  amount: z.number().positive(),
  category: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(["income", "expense"]),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  interval: z.number().int().positive().optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  budgetId: z.string().uuid().nullable().optional(),
  currency: z.enum(["CAD", "USD", "EUR", "GBP", "MXN"]).optional(),
});

const updateRuleSchema = z.object({
  amount: z.number().positive().optional(),
  category: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  type: z.enum(["income", "expense"]).optional(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  interval: z.number().int().positive().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  budgetId: z.string().uuid().nullable().optional(),
  currency: z.enum(["CAD", "USD", "EUR", "GBP", "MXN"]).optional(),
});

export const handleRecurringRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const path = getSplatPath(params);
  const [id, action] = getSplatSegments(params);
  const db = getDb(env.DB);

  if (request.method === "GET" && !path) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:recurring:list`,
      ROUTE_RATE_LIMITS.recurring.list
    );

    const rules = await db.query.recurringTransactions.findMany({
      where: and(
        scopeToHousehold(recurringTransactions.householdId, session!.householdId),
        visibleRecurringRulesCondition(session!.userId)
      ),
      orderBy: (rule, { desc }) => [desc(rule.createdAt)],
    });

    return Response.json(rules);
  }

  if (request.method === "POST" && !path) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:recurring:create`,
      ROUTE_RATE_LIMITS.recurring.create
    );

    const validated = createRuleSchema.parse(await request.json());
    const interval = validated.interval ?? 1;
    const nextRunDate = getInitialNextRunDate(
      validated.startDate,
      validated.frequency,
      interval,
      validated.dayOfMonth,
      validated.endDate
    );

    if (!nextRunDate) {
      throw new ActionError(
        "End date must be on or after the first occurrence date",
        "VALIDATION_ERROR"
      );
    }

    const rule = await db
      .insert(recurringTransactions)
      .values({
        householdId: session!.householdId,
        userId: session!.userId,
        amount: toCents(validated.amount),
        currency: validated.currency ?? "CAD",
        category: validated.category.trim(),
        description: validated.description?.trim() || null,
        type: validated.type,
        frequency: validated.frequency,
        interval,
        dayOfMonth: validated.dayOfMonth ?? null,
        startDate: toISODate(validated.startDate),
        endDate: validated.endDate ? toISODate(validated.endDate) : null,
        nextRunDate: toISODate(nextRunDate),
        budgetId: validated.budgetId || null,
      })
      .returning()
      .get();

    await broadcastToHousehold(env, session!.householdId, {
      type: "RECURRING_UPDATE",
      action: "create",
    });

    return Response.json(rule, { status: 201 });
  }

  if (request.method === "PATCH" && id && !action) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:recurring:update`,
      ROUTE_RATE_LIMITS.recurring.update
    );

    const validated = updateRuleSchema.parse(await request.json());
    const existing = await db.query.recurringTransactions.findFirst({
      where: and(
        eq(recurringTransactions.id, id),
        scopeToHousehold(recurringTransactions.householdId, session!.householdId),
        eq(recurringTransactions.userId, session!.userId)
      ),
    });

    if (!existing) {
      throw new ActionError("Recurring rule not found", "NOT_FOUND");
    }

    const updateData: Record<string, unknown> = {};

    if (validated.amount !== undefined) updateData.amount = toCents(validated.amount);
    if (validated.category !== undefined) updateData.category = validated.category.trim();
    if (validated.description !== undefined) updateData.description = validated.description?.trim() || null;
    if (validated.type !== undefined) updateData.type = validated.type;
    if (validated.frequency !== undefined) updateData.frequency = validated.frequency;
    if (validated.interval !== undefined) updateData.interval = validated.interval;
    if (validated.dayOfMonth !== undefined) updateData.dayOfMonth = validated.dayOfMonth;
    if (validated.endDate !== undefined) updateData.endDate = validated.endDate ? toISODate(validated.endDate) : null;
    if (validated.budgetId !== undefined) updateData.budgetId = validated.budgetId || null;
    if (validated.currency !== undefined) updateData.currency = validated.currency;

    if (
      validated.startDate !== undefined ||
      validated.frequency !== undefined ||
      validated.interval !== undefined ||
      validated.dayOfMonth !== undefined ||
      validated.endDate !== undefined
    ) {
      const startDate = validated.startDate ?? new Date(existing.startDate);
      const frequency = validated.frequency ?? existing.frequency;
      const interval = validated.interval ?? existing.interval;
      const dayOfMonth =
        validated.dayOfMonth !== undefined
          ? validated.dayOfMonth
          : existing.dayOfMonth;
      const endDate =
        validated.endDate !== undefined
          ? validated.endDate
            ? validated.endDate
            : null
          : existing.endDate
            ? new Date(existing.endDate)
            : null;

      updateData.startDate = toISODate(startDate);

      const newNextRunDate = getInitialNextRunDate(
        startDate,
        frequency,
        interval,
        dayOfMonth,
        endDate
      );

      if (newNextRunDate) {
        updateData.nextRunDate = toISODate(newNextRunDate);
      } else {
        updateData.active = false;
        updateData.nextRunDate = toISODate(startDate);
      }
    }

    const rule = await db
      .update(recurringTransactions)
      .set(updateData)
      .where(
        and(
          eq(recurringTransactions.id, id),
          scopeToHousehold(recurringTransactions.householdId, session!.householdId),
          eq(recurringTransactions.userId, session!.userId)
        )
      )
      .returning()
      .get();

    await broadcastToHousehold(env, session!.householdId, {
      type: "RECURRING_UPDATE",
      action: "update",
    });

    return Response.json(rule);
  }

  if (request.method === "DELETE" && id && !action) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:recurring:delete`,
      ROUTE_RATE_LIMITS.recurring.delete
    );

    const deleted = await db
      .delete(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.id, id),
          scopeToHousehold(recurringTransactions.householdId, session!.householdId),
          eq(recurringTransactions.userId, session!.userId)
        )
      )
      .returning()
      .get();

    if (!deleted) {
      throw new ActionError("Recurring rule not found", "NOT_FOUND");
    }

    await broadcastToHousehold(env, session!.householdId, {
      type: "RECURRING_UPDATE",
      action: "delete",
    });

    return Response.json(deleted);
  }

  if (request.method === "POST" && id && action === "toggle") {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:recurring:toggle`,
      ROUTE_RATE_LIMITS.recurring.toggle
    );

    const rule = await db
      .update(recurringTransactions)
      .set({ active: sql`NOT ${recurringTransactions.active}` })
      .where(
        and(
          eq(recurringTransactions.id, id),
          scopeToHousehold(recurringTransactions.householdId, session!.householdId),
          eq(recurringTransactions.userId, session!.userId)
        )
      )
      .returning()
      .get();

    if (!rule) {
      throw new ActionError("Recurring rule not found", "NOT_FOUND");
    }

    await broadcastToHousehold(env, session!.householdId, {
      type: "RECURRING_UPDATE",
      action: "update",
    });

    return Response.json(rule);
  }

  if (request.method === "POST" && path === "process") {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:recurring:process`,
      ROUTE_RATE_LIMITS.recurring.process
    );

    const { processed } = await processDueRecurringRules(env, db, {
      mode: "household_user",
      householdId: session!.householdId,
      userId: session!.userId,
    });

    return Response.json({ processed });
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
