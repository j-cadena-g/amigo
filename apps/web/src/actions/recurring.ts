"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and, lte, withAuditing } from "@amigo/db";
import { recurringTransactions, transactions } from "@amigo/db/schema";
import type { RecurringTransaction } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { publishHouseholdUpdate } from "@/lib/redis";

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

interface CreateRecurringRuleInput {
  amount: number;
  category: string;
  description?: string;
  type: "income" | "expense";
  frequency: Frequency;
  interval?: number;
  startDate: Date;
  endDate?: Date;
}

interface UpdateRecurringRuleInput {
  id: string;
  amount?: number;
  category?: string;
  description?: string | null;
  type?: "income" | "expense";
  frequency?: Frequency;
  interval?: number;
  startDate?: Date;
  endDate?: Date | null;
}

function calculateNextRunDate(
  frequency: Frequency,
  interval: number,
  fromDate: Date
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
      break;
    case "YEARLY":
      next.setFullYear(next.getFullYear() + interval);
      break;
  }

  return next;
}

function getInitialNextRunDate(startDate: Date): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  return start > today ? start : today;
}

export async function getRecurringRules(): Promise<RecurringTransaction[]> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  return db.query.recurringTransactions.findMany({
    where: and(
      eq(recurringTransactions.householdId, session.householdId),
      eq(recurringTransactions.userId, session.userId)
    ),
    orderBy: (rt, { desc }) => [desc(rt.createdAt)],
  });
}

export async function createRecurringRule(input: CreateRecurringRuleInput) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const nextRunDate = getInitialNextRunDate(input.startDate);

  const rule = await withAuditing(session.authId, async (tx) => {
    const [inserted] = await tx
      .insert(recurringTransactions)
      .values({
        householdId: session.householdId,
        userId: session.userId,
        amount: input.amount.toFixed(2),
        category: input.category.trim(),
        description: input.description?.trim() || null,
        type: input.type,
        frequency: input.frequency,
        interval: input.interval ?? 1,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        nextRunDate,
      })
      .returning();
    return inserted;
  });

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "RECURRING_UPDATE",
  });

  revalidatePath("/budget");

  return rule;
}

export async function updateRecurringRule(input: UpdateRecurringRuleInput) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const updateData: Partial<typeof recurringTransactions.$inferInsert> = {};

  if (input.amount !== undefined) {
    updateData.amount = input.amount.toFixed(2);
  }
  if (input.category !== undefined) {
    updateData.category = input.category.trim();
  }
  if (input.description !== undefined) {
    updateData.description = input.description?.trim() || null;
  }
  if (input.type !== undefined) {
    updateData.type = input.type;
  }
  if (input.frequency !== undefined) {
    updateData.frequency = input.frequency;
  }
  if (input.interval !== undefined) {
    updateData.interval = input.interval;
  }
  if (input.startDate !== undefined) {
    updateData.startDate = input.startDate;
    updateData.nextRunDate = getInitialNextRunDate(input.startDate);
  }
  if (input.endDate !== undefined) {
    updateData.endDate = input.endDate;
  }

  const rule = await withAuditing(session.authId, async (tx) => {
    const [updated] = await tx
      .update(recurringTransactions)
      .set(updateData)
      .where(
        and(
          eq(recurringTransactions.id, input.id),
          eq(recurringTransactions.householdId, session.householdId),
          eq(recurringTransactions.userId, session.userId)
        )
      )
      .returning();
    return updated;
  });

  if (!rule) {
    throw new Error("Recurring rule not found");
  }

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "RECURRING_UPDATE",
  });

  revalidatePath("/budget");

  return rule;
}

export async function deleteRecurringRule(id: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const rule = await withAuditing(session.authId, async (tx) => {
    const [deleted] = await tx
      .delete(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.id, id),
          eq(recurringTransactions.householdId, session.householdId),
          eq(recurringTransactions.userId, session.userId)
        )
      )
      .returning();
    return deleted;
  });

  if (!rule) {
    throw new Error("Recurring rule not found");
  }

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "RECURRING_UPDATE",
  });

  revalidatePath("/budget");

  return rule;
}

export async function toggleRecurringRule(id: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  // First get the current state - only for rules owned by this user
  const existing = await db.query.recurringTransactions.findFirst({
    where: and(
      eq(recurringTransactions.id, id),
      eq(recurringTransactions.householdId, session.householdId),
      eq(recurringTransactions.userId, session.userId)
    ),
  });

  if (!existing) {
    throw new Error("Recurring rule not found");
  }

  const rule = await withAuditing(session.authId, async (tx) => {
    const [updated] = await tx
      .update(recurringTransactions)
      .set({ active: !existing.active })
      .where(
        and(
          eq(recurringTransactions.id, id),
          eq(recurringTransactions.householdId, session.householdId),
          eq(recurringTransactions.userId, session.userId)
        )
      )
      .returning();
    return updated;
  });

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "RECURRING_UPDATE",
  });

  revalidatePath("/budget");

  return rule;
}

/**
 * Process all due recurring transactions for the current user.
 * This is called lazily when the user visits the dashboard to ensure data is up to date.
 */
export async function processDueRecurringTransactions() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find all active rules for this user where next_run_date <= today
  const dueRules = await db.query.recurringTransactions.findMany({
    where: and(
      eq(recurringTransactions.householdId, session.householdId),
      eq(recurringTransactions.userId, session.userId),
      eq(recurringTransactions.active, true),
      lte(recurringTransactions.nextRunDate, today)
    ),
  });

  if (dueRules.length === 0) {
    return { processed: 0 };
  }

  let processedCount = 0;

  await withAuditing(session.authId, async (tx) => {
    for (const rule of dueRules) {
      // Check if we've passed the end date
      if (rule.endDate && rule.endDate < today) {
        // Deactivate the rule
        await tx
          .update(recurringTransactions)
          .set({ active: false })
          .where(eq(recurringTransactions.id, rule.id));
        continue;
      }

      // Insert new transaction from template
      await tx.insert(transactions).values({
        householdId: rule.householdId,
        userId: rule.userId,
        amount: rule.amount,
        category: rule.category,
        description: rule.description,
        type: rule.type,
        date: rule.nextRunDate,
      });

      // Calculate new next_run_date
      const newNextRunDate = calculateNextRunDate(
        rule.frequency,
        rule.interval,
        rule.nextRunDate
      );

      // Update the rule
      await tx
        .update(recurringTransactions)
        .set({
          lastRunDate: rule.nextRunDate,
          nextRunDate: newNextRunDate,
        })
        .where(eq(recurringTransactions.id, rule.id));

      processedCount++;
    }
  });

  if (processedCount > 0) {
    await publishHouseholdUpdate({
      householdId: session.householdId,
      type: "TRANSACTION_UPDATE",
    });

    revalidatePath("/budget");
  }

  return { processed: processedCount };
}
