"use server";

import { cookies } from "next/headers";
import { db, eq, and } from "@amigo/db";
import {
  users,
  transactions,
  recurringTransactions,
  budgets,
  assets,
  debts,
  groceryItems,
} from "@amigo/db/schema";
import { createSession, getSessionCookieOptions } from "@/lib/session";
import {
  getPendingRestoreData,
  deletePendingRestoreToken,
  PENDING_RESTORE_COOKIE,
  type PendingRestoreData,
} from "@/lib/restore";
import { redirect } from "next/navigation";

/**
 * Get the pending restore data from the cookie token.
 * Returns null if no valid token exists.
 */
export async function getPendingRestore(): Promise<PendingRestoreData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_RESTORE_COOKIE)?.value;

  if (!token) {
    return null;
  }

  return getPendingRestoreData(token);
}

/**
 * Restore user account - reconnect to previous data.
 * Since soft delete keeps userId FK intact, data automatically reconnects.
 */
export async function restoreUserAccount(): Promise<{
  success: boolean;
  error?: string;
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_RESTORE_COOKIE)?.value;

  if (!token) {
    return { success: false, error: "No pending restore session" };
  }

  const restoreData = await getPendingRestoreData(token);
  if (!restoreData) {
    return { success: false, error: "Restore session expired" };
  }

  try {
    // Clear deletedAt to reactivate the user
    // Update name/email in case they changed in IdP
    const [user] = await db
      .update(users)
      .set({
        deletedAt: null,
        email: restoreData.email,
        name: restoreData.name,
      })
      .where(eq(users.id, restoreData.userId))
      .returning();

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Optionally clear userDisplayName from records since user is back
    // (The name is now live from the user record again)
    await db.transaction(async (tx) => {
      await tx
        .update(transactions)
        .set({ userDisplayName: null })
        .where(eq(transactions.userId, user.id));

      await tx
        .update(recurringTransactions)
        .set({ userDisplayName: null })
        .where(eq(recurringTransactions.userId, user.id));

      await tx
        .update(assets)
        .set({ userDisplayName: null })
        .where(eq(assets.userId, user.id));

      await tx
        .update(debts)
        .set({ userDisplayName: null })
        .where(eq(debts.userId, user.id));

      await tx
        .update(groceryItems)
        .set({ createdByUserDisplayName: null })
        .where(eq(groceryItems.createdByUserId, user.id));
    });

    // Create session
    const sessionId = await createSession(user);

    // Set session cookie and clear restore cookie
    const cookieOptions = getSessionCookieOptions();
    cookieStore.set(cookieOptions.name, sessionId, {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      domain: cookieOptions.domain,
      maxAge: cookieOptions.maxAge,
    });

    // Clean up restore token
    await deletePendingRestoreToken(token);
    cookieStore.delete(PENDING_RESTORE_COOKIE);

    return { success: true };
  } catch (error) {
    console.error("Failed to restore user account:", error);
    return { success: false, error: "Failed to restore account" };
  }
}

/**
 * Fresh start - transfer data to household owner and start with clean slate.
 * Sets transferredFromUserId to track provenance.
 */
export async function freshStartUserAccount(): Promise<{
  success: boolean;
  error?: string;
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_RESTORE_COOKIE)?.value;

  if (!token) {
    return { success: false, error: "No pending restore session" };
  }

  const restoreData = await getPendingRestoreData(token);
  if (!restoreData) {
    return { success: false, error: "Restore session expired" };
  }

  try {
    // Find the household owner
    const owner = await db.query.users.findFirst({
      where: and(
        eq(users.householdId, restoreData.householdId),
        eq(users.role, "owner")
      ),
    });

    if (!owner) {
      return { success: false, error: "Household owner not found" };
    }

    // Reactivate user with member role (fresh start)
    const [user] = await db
      .update(users)
      .set({
        deletedAt: null,
        email: restoreData.email,
        name: restoreData.name,
        role: "member", // Reset to member role
      })
      .where(eq(users.id, restoreData.userId))
      .returning();

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Transfer all records from restored user to owner
    // Set transferredFromUserId to preserve provenance
    await db.transaction(async (tx) => {
      // Transfer transactions
      await tx
        .update(transactions)
        .set({
          userId: owner.id,
          transferredFromUserId: user.id,
        })
        .where(eq(transactions.userId, user.id));

      // Transfer recurring transactions
      await tx
        .update(recurringTransactions)
        .set({
          userId: owner.id,
          transferredFromUserId: user.id,
        })
        .where(eq(recurringTransactions.userId, user.id));

      // Transfer personal budgets (budgets with userId set)
      await tx
        .update(budgets)
        .set({
          userId: owner.id,
          transferredFromUserId: user.id,
        })
        .where(eq(budgets.userId, user.id));

      // Transfer assets
      await tx
        .update(assets)
        .set({
          userId: owner.id,
          transferredFromUserId: user.id,
        })
        .where(eq(assets.userId, user.id));

      // Transfer debts
      await tx
        .update(debts)
        .set({
          userId: owner.id,
          transferredFromUserId: user.id,
        })
        .where(eq(debts.userId, user.id));

      // Transfer grocery items
      await tx
        .update(groceryItems)
        .set({
          createdByUserId: owner.id,
          transferredFromCreatedByUserId: user.id,
        })
        .where(eq(groceryItems.createdByUserId, user.id));
    });

    // Create session
    const sessionId = await createSession(user);

    // Set session cookie and clear restore cookie
    const cookieOptions = getSessionCookieOptions();
    cookieStore.set(cookieOptions.name, sessionId, {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      domain: cookieOptions.domain,
      maxAge: cookieOptions.maxAge,
    });

    // Clean up restore token
    await deletePendingRestoreToken(token);
    cookieStore.delete(PENDING_RESTORE_COOKIE);

    return { success: true };
  } catch (error) {
    console.error("Failed to fresh start user account:", error);
    return { success: false, error: "Failed to start fresh" };
  }
}

/**
 * Cancel the restore process and redirect to login.
 */
export async function cancelRestore(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_RESTORE_COOKIE)?.value;

  if (token) {
    await deletePendingRestoreToken(token);
    cookieStore.delete(PENDING_RESTORE_COOKIE);
  }

  redirect("/api/auth/login");
}
