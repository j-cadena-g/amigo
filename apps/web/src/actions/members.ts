"use server";

import { db, eq, and, isNull, sql } from "@amigo/db";
import {
  users,
  transactions,
  recurringTransactions,
  budgets,
  assets,
  debts,
  groceryItems,
  pushSubscriptions,
} from "@amigo/db/schema";
import { getSession, updateSessionRole } from "@/lib/session";
import {
  canManageMembers,
  canTransferOwnership,
  canChangeRole,
} from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

/**
 * Update a member's role (owner/admin can promote to admin or demote to member)
 */
export async function updateMemberRole(input: {
  userId: string;
  role: "admin" | "member";
}) {
  const session = await getSession();

  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  if (!canManageMembers(session)) {
    return { success: false, error: "Not authorized to manage members" };
  }

  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input" };
  }

  // Verify target user is in same household
  const targetUser = await db.query.users.findFirst({
    where: and(
      eq(users.id, parsed.data.userId),
      eq(users.householdId, session.householdId)
    ),
  });

  if (!targetUser) {
    return { success: false, error: "User not found in household" };
  }

  // Cannot change owner's role
  if (targetUser.role === "owner") {
    return {
      success: false,
      error: "Cannot change owner's role directly. Use ownership transfer instead.",
    };
  }

  // Verify permission to change to this role
  if (!canChangeRole(session, parsed.data.role, parsed.data.userId)) {
    return { success: false, error: "Not authorized to assign this role" };
  }

  try {
    await db
      .update(users)
      .set({ role: parsed.data.role })
      .where(eq(users.id, parsed.data.userId));

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Failed to update member role:", error);
    return { success: false, error: "Failed to update member role" };
  }
}

/**
 * Transfer ownership to another member (owner only)
 */
export async function transferOwnership(newOwnerId: string) {
  const session = await getSession();

  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  if (!canTransferOwnership(session)) {
    return { success: false, error: "Only the owner can transfer ownership" };
  }

  // Verify new owner is in same household
  const newOwner = await db.query.users.findFirst({
    where: and(
      eq(users.id, newOwnerId),
      eq(users.householdId, session.householdId)
    ),
  });

  if (!newOwner) {
    return { success: false, error: "User not found in household" };
  }

  if (newOwnerId === session.userId) {
    return { success: false, error: "You are already the owner" };
  }

  try {
    // Use transaction to ensure atomicity
    await db.transaction(async (tx) => {
      // Demote current owner to admin
      await tx
        .update(users)
        .set({ role: "admin" })
        .where(eq(users.id, session.userId));

      // Promote new owner
      await tx
        .update(users)
        .set({ role: "owner" })
        .where(eq(users.id, newOwnerId));
    });

    // Update current user's session to reflect new role
    await updateSessionRole("admin");

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Failed to transfer ownership:", error);
    return { success: false, error: "Failed to transfer ownership" };
  }
}

export interface MemberDataSummary {
  transactions: number;
  recurringTransactions: number;
  personalBudgets: number;
  assets: number;
  debts: number;
  groceryItems: number;
}

/**
 * Get a summary of data associated with a member (for removal confirmation)
 */
export async function getMemberDataSummary(
  userId: string
): Promise<{ success: boolean; error?: string; summary?: MemberDataSummary }> {
  const session = await getSession();

  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  if (!canManageMembers(session)) {
    return { success: false, error: "Not authorized" };
  }

  // Verify target user is in same household
  const targetUser = await db.query.users.findFirst({
    where: and(
      eq(users.id, userId),
      eq(users.householdId, session.householdId),
      isNull(users.deletedAt)
    ),
  });

  if (!targetUser) {
    return { success: false, error: "User not found" };
  }

  try {
    const [
      transactionCount,
      recurringCount,
      budgetCount,
      assetCount,
      debtCount,
      groceryCount,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(transactions)
        .where(
          and(eq(transactions.userId, userId), isNull(transactions.deletedAt))
        )
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(recurringTransactions)
        .where(eq(recurringTransactions.userId, userId))
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(budgets)
        .where(and(eq(budgets.userId, userId), isNull(budgets.deletedAt)))
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(assets)
        .where(and(eq(assets.userId, userId), isNull(assets.deletedAt)))
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(debts)
        .where(and(eq(debts.userId, userId), isNull(debts.deletedAt)))
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(groceryItems)
        .where(
          and(
            eq(groceryItems.createdByUserId, userId),
            isNull(groceryItems.deletedAt)
          )
        )
        .then((r) => r[0]?.count ?? 0),
    ]);

    return {
      success: true,
      summary: {
        transactions: transactionCount,
        recurringTransactions: recurringCount,
        personalBudgets: budgetCount,
        assets: assetCount,
        debts: debtCount,
        groceryItems: groceryCount,
      },
    };
  } catch (error) {
    console.error("Failed to get member data summary:", error);
    return { success: false, error: "Failed to get data summary" };
  }
}

/**
 * Remove a member from the household (owner/admin only)
 * Uses soft delete and preserves data with denormalized user display name
 */
export async function removeMember(userId: string) {
  const session = await getSession();

  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  if (!canManageMembers(session)) {
    return { success: false, error: "Not authorized to remove members" };
  }

  // Cannot remove yourself
  if (userId === session.userId) {
    return { success: false, error: "Cannot remove yourself" };
  }

  // Verify target user is in same household and not already deleted
  const targetUser = await db.query.users.findFirst({
    where: and(
      eq(users.id, userId),
      eq(users.householdId, session.householdId),
      isNull(users.deletedAt)
    ),
  });

  if (!targetUser) {
    return { success: false, error: "User not found in household" };
  }

  // Cannot remove owner
  if (targetUser.role === "owner") {
    return { success: false, error: "Cannot remove the owner" };
  }

  // Admin cannot remove another admin
  if (session.role === "admin" && targetUser.role === "admin") {
    return { success: false, error: "Admins cannot remove other admins" };
  }

  const userDisplayName = targetUser.name ?? targetUser.email;

  try {
    await db.transaction(async (tx) => {
      // Denormalize user display name to all related records before soft delete
      // This preserves who created/owned the data for historical purposes

      // Update transactions
      await tx
        .update(transactions)
        .set({ userDisplayName })
        .where(eq(transactions.userId, userId));

      // Update recurring transactions
      await tx
        .update(recurringTransactions)
        .set({ userDisplayName })
        .where(eq(recurringTransactions.userId, userId));

      // Update assets
      await tx
        .update(assets)
        .set({ userDisplayName })
        .where(eq(assets.userId, userId));

      // Update debts
      await tx
        .update(debts)
        .set({ userDisplayName })
        .where(eq(debts.userId, userId));

      // Update grocery items
      await tx
        .update(groceryItems)
        .set({ createdByUserDisplayName: userDisplayName })
        .where(eq(groceryItems.createdByUserId, userId));

      // Delete push subscriptions (not useful without active user)
      await tx
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));

      // Soft delete the user
      await tx
        .update(users)
        .set({ deletedAt: new Date() })
        .where(eq(users.id, userId));
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Failed to remove member:", error);
    return { success: false, error: "Failed to remove member" };
  }
}

/**
 * Get all active members in the household with their roles
 */
export async function getHouseholdMembers() {
  const session = await getSession();

  if (!session) {
    return { success: false, error: "Not authenticated", members: [] };
  }

  try {
    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(
        and(
          eq(users.householdId, session.householdId),
          isNull(users.deletedAt)
        )
      );

    return { success: true, members };
  } catch (error) {
    console.error("Failed to get household members:", error);
    return { success: false, error: "Failed to get members", members: [] };
  }
}
