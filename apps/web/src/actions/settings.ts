"use server";

import { db, eq } from "@amigo/db";
import { households, users, debts, groceryItems, transactions } from "@amigo/db/schema";
import { getSession, updateSessionHousehold } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const updateHouseholdNameSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
});

export async function updateHouseholdName(input: { name: string }) {
  const session = await getSession();

  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  const parsed = updateHouseholdNameSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  try {
    await db
      .update(households)
      .set({ name: parsed.data.name })
      .where(eq(households.id, session.householdId));

    revalidatePath("/settings");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Failed to update household name:", error);
    return { success: false, error: "Failed to update household name" };
  }
}

const joinHouseholdSchema = z.object({
  targetHouseholdId: z.string().uuid("Invalid household ID format"),
});

export async function joinHousehold(input: { targetHouseholdId: string }) {
  const session = await getSession();

  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  const parsed = joinHouseholdSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { targetHouseholdId } = parsed.data;
  const oldHouseholdId = session.householdId;

  // Cannot join your own household
  if (targetHouseholdId === oldHouseholdId) {
    return { success: false, error: "You are already in this household" };
  }

  try {
    // Check if target household exists
    const targetHousehold = await db
      .select()
      .from(households)
      .where(eq(households.id, targetHouseholdId))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!targetHousehold) {
      return { success: false, error: "Household not found" };
    }

    // Migrate user's data to the new household
    // 1. Update user's householdId
    await db
      .update(users)
      .set({ householdId: targetHouseholdId })
      .where(eq(users.id, session.userId));

    // 2. Update debts - migrate user's debts to new household
    await db
      .update(debts)
      .set({ householdId: targetHouseholdId })
      .where(eq(debts.userId, session.userId));

    // 3. Update grocery items - migrate items created by this user
    await db
      .update(groceryItems)
      .set({ householdId: targetHouseholdId })
      .where(eq(groceryItems.createdByUserId, session.userId));

    // 4. Update transactions - migrate user's transactions
    await db
      .update(transactions)
      .set({ householdId: targetHouseholdId })
      .where(eq(transactions.userId, session.userId));

    // 5. Check if old household has any remaining users
    const remainingUsers = await db
      .select()
      .from(users)
      .where(eq(users.householdId, oldHouseholdId))
      .limit(1);

    // 6. Delete old household if empty (cascade will clean up any orphaned data)
    if (remainingUsers.length === 0) {
      await db
        .delete(households)
        .where(eq(households.id, oldHouseholdId));
    }

    // 7. Update session with new householdId
    await updateSessionHousehold(targetHouseholdId);

    // Revalidate all paths
    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath("/groceries");
    revalidatePath("/debts");
    revalidatePath("/transactions");

    return { success: true, householdName: targetHousehold.name };
  } catch (error) {
    console.error("Failed to join household:", error);
    return { success: false, error: "Failed to join household" };
  }
}
