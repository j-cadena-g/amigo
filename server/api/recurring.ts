import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../env";
import { getDb, recurringTransactions, transactions, households, scopeToHousehold, eq, and, lte } from "@amigo/db";
import { broadcastToHousehold } from "../lib/realtime";
import { ActionError } from "../lib/errors";
import { toCents, toISODate } from "../lib/conversions";
import { getExchangeRateForRecord } from "../lib/exchange-rates";
import type { CurrencyCode } from "@amigo/db";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

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

export const recurringRoute = new Hono<HonoEnv>();

function calculateNextRunDate(
  frequency: Frequency,
  interval: number,
  fromDate: Date,
  dayOfMonth?: number | null
): Date {
  const next = new Date(fromDate);
  switch (frequency) {
    case "DAILY":
      next.setDate(next.getDate() + interval);
      break;
    case "WEEKLY":
      next.setDate(next.getDate() + interval * 7);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + interval);
      if (dayOfMonth) {
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, lastDay));
      }
      break;
    case "YEARLY":
      next.setFullYear(next.getFullYear() + interval);
      break;
  }
  return next;
}

function getInitialNextRunDate(
  startDate: Date,
  frequency: Frequency,
  interval: number,
  dayOfMonth?: number | null,
  endDate?: Date | null
): Date | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = endDate ? new Date(endDate) : null;
  if (end) end.setHours(0, 0, 0, 0);

  if (start > today) {
    if (end && start > end) return null;
    return start;
  }

  let nextRun = new Date(start);
  while (nextRun < today) {
    nextRun = calculateNextRunDate(frequency, interval, nextRun, dayOfMonth);
  }
  if (end && nextRun > end) return null;
  return nextRun;
}

async function getHomeCurrency(db: ReturnType<typeof getDb>, householdId: string): Promise<CurrencyCode> {
  const household = await db.query.households.findFirst({
    where: eq(households.id, householdId),
  });
  return (household?.homeCurrency as CurrencyCode) ?? "CAD";
}

// List rules
recurringRoute.get("/", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:recurring:list`,
    ROUTE_RATE_LIMITS.recurring.list
  );
  const db = getDb(c.env.DB);

  const rules = await db.query.recurringTransactions.findMany({
    where: and(
      scopeToHousehold(recurringTransactions.householdId, session.householdId),
      eq(recurringTransactions.userId, session.userId)
    ),
    orderBy: (rt, { desc }) => [desc(rt.createdAt)],
  });

  return c.json(rules);
});

// Create rule
recurringRoute.post("/", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:recurring:create`,
    ROUTE_RATE_LIMITS.recurring.create
  );
  const body = await c.req.json();
  const validated = createRuleSchema.parse(body);
  const db = getDb(c.env.DB);

  const interval = validated.interval ?? 1;
  const nextRunDate = getInitialNextRunDate(
    validated.startDate,
    validated.frequency,
    interval,
    validated.dayOfMonth,
    validated.endDate
  );

  if (!nextRunDate) {
    throw new ActionError("End date must be on or after the first occurrence date", "VALIDATION_ERROR");
  }

  const rule = await db
    .insert(recurringTransactions)
    .values({
      householdId: session.householdId,
      userId: session.userId,
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

  await broadcastToHousehold(c.env, session.householdId, {
    type: "RECURRING_UPDATE",
    action: "create",
  });

  return c.json(rule, 201);
});

// Update rule
recurringRoute.patch("/:id", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:recurring:update`,
    ROUTE_RATE_LIMITS.recurring.update
  );
  const id = c.req.param("id");
  const body = await c.req.json();
  const validated = updateRuleSchema.parse(body);
  const db = getDb(c.env.DB);

  const existing = await db.query.recurringTransactions.findFirst({
    where: and(
      eq(recurringTransactions.id, id),
      scopeToHousehold(recurringTransactions.householdId, session.householdId),
      eq(recurringTransactions.userId, session.userId)
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

  // Recalculate nextRunDate if scheduling fields changed
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
    const dayOfMonth = validated.dayOfMonth !== undefined ? validated.dayOfMonth : existing.dayOfMonth;
    const endDate = validated.endDate !== undefined
      ? (validated.endDate ? validated.endDate : null)
      : (existing.endDate ? new Date(existing.endDate) : null);

    updateData.startDate = toISODate(startDate);

    const newNextRunDate = getInitialNextRunDate(startDate, frequency, interval, dayOfMonth, endDate);
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
        scopeToHousehold(recurringTransactions.householdId, session.householdId),
        eq(recurringTransactions.userId, session.userId)
      )
    )
    .returning()
    .get();

  await broadcastToHousehold(c.env, session.householdId, {
    type: "RECURRING_UPDATE",
    action: "update",
  });

  return c.json(rule);
});

// Delete rule
recurringRoute.delete("/:id", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:recurring:delete`,
    ROUTE_RATE_LIMITS.recurring.delete
  );
  const id = c.req.param("id");
  const db = getDb(c.env.DB);

  const deleted = await db
    .delete(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.id, id),
        scopeToHousehold(recurringTransactions.householdId, session.householdId),
        eq(recurringTransactions.userId, session.userId)
      )
    )
    .returning()
    .get();

  if (!deleted) {
    throw new ActionError("Recurring rule not found", "NOT_FOUND");
  }

  await broadcastToHousehold(c.env, session.householdId, {
    type: "RECURRING_UPDATE",
    action: "delete",
  });

  return c.json(deleted);
});

// Toggle active/inactive
recurringRoute.post("/:id/toggle", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:recurring:toggle`,
    ROUTE_RATE_LIMITS.recurring.toggle
  );
  const id = c.req.param("id");
  const db = getDb(c.env.DB);

  const existing = await db.query.recurringTransactions.findFirst({
    where: and(
      eq(recurringTransactions.id, id),
      scopeToHousehold(recurringTransactions.householdId, session.householdId),
      eq(recurringTransactions.userId, session.userId)
    ),
  });

  if (!existing) {
    throw new ActionError("Recurring rule not found", "NOT_FOUND");
  }

  const rule = await db
    .update(recurringTransactions)
    .set({ active: !existing.active })
    .where(
      and(
        eq(recurringTransactions.id, id),
        scopeToHousehold(recurringTransactions.householdId, session.householdId),
        eq(recurringTransactions.userId, session.userId)
      )
    )
    .returning()
    .get();

  await broadcastToHousehold(c.env, session.householdId, {
    type: "RECURRING_UPDATE",
    action: "update",
  });

  return c.json(rule);
});

// Process due recurring transactions
recurringRoute.post("/process", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:recurring:process`,
    ROUTE_RATE_LIMITS.recurring.process
  );
  const db = getDb(c.env.DB);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toISODate(today);

  const dueRules = await db.query.recurringTransactions.findMany({
    where: and(
      scopeToHousehold(recurringTransactions.householdId, session.householdId),
      eq(recurringTransactions.userId, session.userId),
      eq(recurringTransactions.active, true),
      lte(recurringTransactions.nextRunDate, todayStr)
    ),
  });

  if (dueRules.length === 0) {
    return c.json({ processed: 0 });
  }

  let processedCount = 0;

  for (const rule of dueRules) {
    if (rule.endDate && rule.endDate < todayStr) {
      await db
        .update(recurringTransactions)
        .set({ active: false })
        .where(eq(recurringTransactions.id, rule.id));
      continue;
    }

    const homeCurrency = await getHomeCurrency(db, rule.householdId);
    const exchangeRateToHome = await getExchangeRateForRecord(c.env, rule.currency, homeCurrency);

    await db.insert(transactions).values({
      householdId: rule.householdId,
      userId: rule.userId,
      amount: rule.amount,
      currency: rule.currency,
      exchangeRateToHome,
      category: rule.category,
      description: rule.description,
      type: rule.type,
      date: rule.nextRunDate,
      budgetId: rule.budgetId,
    });

    const nextRunDate = calculateNextRunDate(
      rule.frequency,
      rule.interval,
      new Date(rule.nextRunDate),
      rule.dayOfMonth
    );

    const endDate = rule.endDate ? new Date(rule.endDate) : null;
    if (endDate) endDate.setHours(0, 0, 0, 0);

    if (endDate && nextRunDate > endDate) {
      await db
        .update(recurringTransactions)
        .set({ lastRunDate: rule.nextRunDate, active: false })
        .where(eq(recurringTransactions.id, rule.id));
    } else {
      await db
        .update(recurringTransactions)
        .set({ lastRunDate: rule.nextRunDate, nextRunDate: toISODate(nextRunDate) })
        .where(eq(recurringTransactions.id, rule.id));
    }

    processedCount++;
  }

  if (processedCount > 0) {
    await broadcastToHousehold(c.env, session.householdId, {
      type: "TRANSACTION_UPDATE",
      action: "batch_create",
      count: processedCount,
    });
  }

  return c.json({ processed: processedCount });
});
