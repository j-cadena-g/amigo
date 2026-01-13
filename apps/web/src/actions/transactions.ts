"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and, or, isNull, sql, withAuditContext } from "@amigo/db";
import { transactions, households, budgets, type CurrencyCode } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { publishHouseholdUpdate } from "@/lib/redis";
import { getExchangeRateForRecord } from "@/lib/exchange-rates";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";

// Validation schemas
const currencyEnum = z.enum(["CAD", "USD", "EUR", "GBP", "MXN"]);

const addTransactionSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  description: z.string().max(500, "Description too long").optional(),
  category: z.string().min(1, "Category is required").max(100, "Category too long"),
  type: z.enum(["income", "expense"]),
  date: z.date(),
  budgetId: z.string().uuid().nullable().optional(),
  currency: currencyEnum.optional(),
});

const updateTransactionSchema = z.object({
  id: z.string().uuid("Invalid transaction ID"),
  amount: z.number().positive("Amount must be positive").optional(),
  description: z.string().max(500, "Description too long").nullable().optional(),
  category: z.string().min(1, "Category is required").max(100, "Category too long").optional(),
  type: z.enum(["income", "expense"]).optional(),
  date: z.date().optional(),
  budgetId: z.string().uuid().nullable().optional(),
  currency: currencyEnum.optional(),
});

const transactionIdSchema = z.string().uuid("Invalid transaction ID");

interface AddTransactionInput {
  amount: number;
  description?: string;
  category: string;
  type: "income" | "expense";
  date: Date;
  budgetId?: string | null;
  currency?: CurrencyCode;
}

async function getHomeCurrency(householdId: string): Promise<CurrencyCode> {
  const household = await db.query.households.findFirst({
    where: eq(households.id, householdId),
  });
  return household?.homeCurrency ?? "CAD";
}

export async function addTransaction(input: AddTransactionInput) {
  await enforceRateLimit("action:transactions:add", RATE_LIMITS.MUTATION);

  const validated = addTransactionSchema.parse(input);

  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const currency = validated.currency ?? "CAD";
  const homeCurrency = await getHomeCurrency(session.householdId);
  const exchangeRateToHome = await getExchangeRateForRecord(currency, homeCurrency);

  const [transaction] = await withAuditContext(session.authId, async (tx) => {
    return tx
      .insert(transactions)
      .values({
        householdId: session.householdId,
        userId: session.userId,
        amount: validated.amount.toFixed(2),
        currency,
        exchangeRateToHome,
        description: validated.description?.trim() || null,
        category: validated.category.trim(),
        type: validated.type,
        date: validated.date,
        budgetId: validated.budgetId || null,
      })
      .returning();
  });

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "TRANSACTION_UPDATE",
  });

  revalidatePath("/budget");

  return transaction;
}

interface UpdateTransactionInput {
  id: string;
  amount?: number;
  description?: string | null;
  category?: string;
  type?: "income" | "expense";
  date?: Date;
  budgetId?: string | null;
  currency?: CurrencyCode;
}

export async function updateTransaction(input: UpdateTransactionInput) {
  await enforceRateLimit("action:transactions:update", RATE_LIMITS.MUTATION);

  const validated = updateTransactionSchema.parse(input);

  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const updateData: Partial<typeof transactions.$inferInsert> = {};

  if (validated.amount !== undefined) {
    updateData.amount = validated.amount.toFixed(2);
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
    updateData.date = validated.date;
  }
  if (validated.budgetId !== undefined) {
    updateData.budgetId = validated.budgetId || null;
  }
  if (validated.currency !== undefined) {
    updateData.currency = validated.currency;
    const homeCurrency = await getHomeCurrency(session.householdId);
    updateData.exchangeRateToHome = await getExchangeRateForRecord(
      validated.currency,
      homeCurrency
    );
  }

  const visibilityCondition = or(
    eq(transactions.userId, session.userId),
    sql`EXISTS (
      SELECT 1 FROM ${budgets}
      WHERE ${budgets.id} = ${transactions.budgetId}
      AND ${budgets.userId} IS NULL
    )`
  );

  const [transaction] = await withAuditContext(session.authId, async (tx) => {
    return tx
      .update(transactions)
      .set(updateData)
      .where(
        and(
          eq(transactions.id, validated.id),
          eq(transactions.householdId, session.householdId),
          isNull(transactions.deletedAt),
          visibilityCondition
        )
      )
      .returning();
  });

  if (!transaction) {
    throw new Error("Transaction not found");
  }

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "TRANSACTION_UPDATE",
  });

  revalidatePath("/budget");

  return transaction;
}

export async function deleteTransaction(id: string) {
  await enforceRateLimit("action:transactions:delete", RATE_LIMITS.MUTATION);

  const validatedId = transactionIdSchema.parse(id);

  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const visibilityCondition = or(
    eq(transactions.userId, session.userId),
    sql`EXISTS (
      SELECT 1 FROM ${budgets}
      WHERE ${budgets.id} = ${transactions.budgetId}
      AND ${budgets.userId} IS NULL
    )`
  );

  const [deleted] = await withAuditContext(session.authId, async (tx) => {
    return tx
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(transactions.id, validatedId),
          eq(transactions.householdId, session.householdId),
          isNull(transactions.deletedAt),
          visibilityCondition
        )
      )
      .returning();
  });

  if (!deleted) {
    throw new Error("Transaction not found");
  }

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "TRANSACTION_UPDATE",
  });

  revalidatePath("/budget");

  return deleted;
}
