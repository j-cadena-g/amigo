"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and, or, isNull, sql, withAuditContext } from "@amigo/db";
import { transactions, households, budgets, type CurrencyCode } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { publishHouseholdUpdate } from "@/lib/redis";
import { getExchangeRateForRecord } from "@/lib/exchange-rates";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

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

  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const currency = input.currency ?? "CAD";
  const homeCurrency = await getHomeCurrency(session.householdId);
  const exchangeRateToHome = await getExchangeRateForRecord(currency, homeCurrency);

  const [transaction] = await withAuditContext(session.authId, async (tx) => {
    return tx
      .insert(transactions)
      .values({
        householdId: session.householdId,
        userId: session.userId,
        amount: input.amount.toFixed(2),
        currency,
        exchangeRateToHome,
        description: input.description?.trim() || null,
        category: input.category.trim(),
        type: input.type,
        date: input.date,
        budgetId: input.budgetId || null,
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

  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const updateData: Partial<typeof transactions.$inferInsert> = {};

  if (input.amount !== undefined) {
    updateData.amount = input.amount.toFixed(2);
  }
  if (input.description !== undefined) {
    updateData.description = input.description?.trim() || null;
  }
  if (input.category !== undefined) {
    updateData.category = input.category.trim();
  }
  if (input.type !== undefined) {
    updateData.type = input.type;
  }
  if (input.date !== undefined) {
    updateData.date = input.date;
  }
  if (input.budgetId !== undefined) {
    updateData.budgetId = input.budgetId || null;
  }
  if (input.currency !== undefined) {
    updateData.currency = input.currency;
    const homeCurrency = await getHomeCurrency(session.householdId);
    updateData.exchangeRateToHome = await getExchangeRateForRecord(
      input.currency,
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
          eq(transactions.id, input.id),
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
          eq(transactions.id, id),
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
