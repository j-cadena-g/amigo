"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and, or, isNull, gte, lte, sql } from "@amigo/db";
import { budgets, transactions } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { canManageSharedBudgets } from "@/lib/permissions";
import { z } from "zod";

import type { CurrencyCode } from "@amigo/db/schema";

const budgetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(),
  limitAmount: z.number().positive("Limit must be positive"),
  period: z.enum(["weekly", "monthly", "yearly"]),
  isShared: z.boolean(),
  currency: z.enum(["CAD", "USD", "EUR", "GBP", "MXN"]).optional(),
});

export type BudgetInput = z.infer<typeof budgetSchema>;

export interface BudgetWithSpending {
  id: string;
  householdId: string;
  userId: string | null;
  name: string;
  category: string | null;
  limitAmount: string;
  currency: CurrencyCode;
  period: "weekly" | "monthly" | "yearly";
  createdAt: Date;
  updatedAt: Date;
  isShared: boolean;
  currentSpending: number;
  percentUsed: number;
  remainingAmount: number;
}

function getPeriodBounds(period: "weekly" | "monthly" | "yearly"): {
  start: Date;
  end: Date;
} {
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

export async function getBudgetsWithSpending(): Promise<BudgetWithSpending[]> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const userBudgets = await db.query.budgets.findMany({
    where: and(
      eq(budgets.householdId, session.householdId),
      or(
        eq(budgets.userId, session.userId),
        isNull(budgets.userId)
      ),
      isNull(budgets.deletedAt)
    ),
    orderBy: (budgets, { desc }) => [desc(budgets.createdAt)],
  });

  const budgetsWithSpending: BudgetWithSpending[] = await Promise.all(
    userBudgets.map(async (budget) => {
      const { start, end } = getPeriodBounds(budget.period);
      const isShared = budget.userId === null;

      const baseConditions = [
        eq(transactions.budgetId, budget.id),
        eq(transactions.householdId, session.householdId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        gte(transactions.date, start),
        lte(transactions.date, end),
      ];

      if (!isShared && budget.userId) {
        baseConditions.push(eq(transactions.userId, budget.userId));
      }

      const spendingResult = await db
        .select({
          total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(and(...baseConditions));

      const currentSpending = parseFloat(spendingResult[0]?.total ?? "0");
      const limit = parseFloat(budget.limitAmount);
      const percentUsed = limit > 0 ? (currentSpending / limit) * 100 : 0;
      const remainingAmount = Math.max(0, limit - currentSpending);

      return {
        id: budget.id,
        householdId: budget.householdId,
        userId: budget.userId,
        name: budget.name,
        category: budget.category,
        limitAmount: budget.limitAmount,
        currency: budget.currency,
        period: budget.period,
        createdAt: budget.createdAt,
        updatedAt: budget.updatedAt,
        isShared,
        currentSpending,
        percentUsed,
        remainingAmount,
      };
    })
  );

  return budgetsWithSpending;
}

export async function getBudgets() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const userBudgets = await db.query.budgets.findMany({
    where: and(
      eq(budgets.householdId, session.householdId),
      or(
        eq(budgets.userId, session.userId),
        isNull(budgets.userId)
      ),
      isNull(budgets.deletedAt)
    ),
    orderBy: (budgets, { asc }) => [asc(budgets.category)],
  });

  return userBudgets.map((b) => ({
    ...b,
    isShared: b.userId === null,
  }));
}

export async function createBudget(input: BudgetInput) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const validated = budgetSchema.parse(input);

  // Only owners/admins can create shared budgets
  if (validated.isShared && !canManageSharedBudgets(session)) {
    throw new Error("Only owners and admins can create shared budgets");
  }

  const [budget] = await db
    .insert(budgets)
    .values({
      householdId: session.householdId,
      userId: validated.isShared ? null : session.userId,
      name: validated.name.trim(),
      category: validated.category?.trim() || null,
      limitAmount: validated.limitAmount.toFixed(2),
      currency: validated.currency ?? "CAD",
      period: validated.period,
    })
    .returning();

  revalidatePath("/budget");

  return budget;
}

export async function updateBudget(id: string, input: BudgetInput) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const validated = budgetSchema.parse(input);

  // Get existing budget to check permissions
  const existingBudget = await db.query.budgets.findFirst({
    where: and(
      eq(budgets.id, id),
      eq(budgets.householdId, session.householdId),
      isNull(budgets.deletedAt)
    ),
  });

  if (!existingBudget) {
    throw new Error("Budget not found");
  }

  const isCurrentlyShared = existingBudget.userId === null;

  // Check permissions for shared budgets
  if (isCurrentlyShared || validated.isShared) {
    if (!canManageSharedBudgets(session)) {
      throw new Error("Only owners and admins can modify shared budgets");
    }
  } else if (existingBudget.userId !== session.userId) {
    // Cannot modify another user's personal budget
    throw new Error("Cannot modify another user's personal budget");
  }

  const [updated] = await db
    .update(budgets)
    .set({
      userId: validated.isShared ? null : session.userId,
      name: validated.name.trim(),
      category: validated.category?.trim() || null,
      limitAmount: validated.limitAmount.toFixed(2),
      currency: validated.currency ?? "CAD",
      period: validated.period,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(budgets.id, id),
        eq(budgets.householdId, session.householdId)
      )
    )
    .returning();

  if (!updated) {
    throw new Error("Budget not found");
  }

  revalidatePath("/budget");

  return updated;
}

export async function deleteBudget(id: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  // Get existing budget to check permissions
  const existingBudget = await db.query.budgets.findFirst({
    where: and(
      eq(budgets.id, id),
      eq(budgets.householdId, session.householdId),
      isNull(budgets.deletedAt)
    ),
  });

  if (!existingBudget) {
    throw new Error("Budget not found");
  }

  const isShared = existingBudget.userId === null;

  // Check permissions for shared budgets
  if (isShared) {
    if (!canManageSharedBudgets(session)) {
      throw new Error("Only owners and admins can delete shared budgets");
    }
  } else if (existingBudget.userId !== session.userId) {
    throw new Error("Cannot delete another user's personal budget");
  }

  const [deleted] = await db
    .update(budgets)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(budgets.id, id),
        eq(budgets.householdId, session.householdId)
      )
    )
    .returning();

  if (!deleted) {
    throw new Error("Budget not found");
  }

  revalidatePath("/budget");

  return deleted;
}
