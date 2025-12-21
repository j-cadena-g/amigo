"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and } from "@amigo/db";
import { debts } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { z } from "zod";

const loanSchema = z.object({
  type: z.literal("LOAN"),
  name: z.string().min(1, "Name is required"),
  loanAmount: z.number().positive("Loan amount must be positive"),
  totalPaid: z.number().min(0, "Total paid cannot be negative"),
});

const creditCardSchema = z.object({
  type: z.literal("CREDIT_CARD"),
  name: z.string().min(1, "Name is required"),
  creditLimit: z.number().positive("Credit limit must be positive"),
  availableCredit: z.number().min(0, "Available credit cannot be negative"),
});

const addDebtSchema = z.discriminatedUnion("type", [loanSchema, creditCardSchema]);

export type AddDebtInput = z.infer<typeof addDebtSchema>;

export async function addDebt(input: AddDebtInput) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const validated = addDebtSchema.parse(input);

  let balanceInitial: string;
  let balanceCurrent: string;

  if (validated.type === "LOAN") {
    // For loans: initial = loan amount, current = total paid
    balanceInitial = validated.loanAmount.toFixed(2);
    balanceCurrent = validated.totalPaid.toFixed(2);
  } else {
    // For credit cards: initial = credit limit, current = available credit
    balanceInitial = validated.creditLimit.toFixed(2);
    balanceCurrent = validated.availableCredit.toFixed(2);
  }

  const [debt] = await db
    .insert(debts)
    .values({
      householdId: session.householdId,
      name: validated.name.trim(),
      type: validated.type,
      balanceInitial,
      balanceCurrent,
    })
    .returning();

  revalidatePath("/debts");

  return debt;
}

export async function deleteDebt(id: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  // Soft delete
  const [deleted] = await db
    .update(debts)
    .set({
      deletedAt: new Date(),
    })
    .where(
      and(
        eq(debts.id, id),
        eq(debts.householdId, session.householdId)
      )
    )
    .returning();

  if (!deleted) {
    throw new Error("Debt not found");
  }

  revalidatePath("/debts");

  return deleted;
}
