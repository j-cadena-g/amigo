import {
  and,
  assets,
  debts,
  eq,
  groceryItems,
  isNull,
  ne,
  pushSubscriptions,
  recurringTransactions,
  scopeToHousehold,
  transactions,
  users,
  type DrizzleD1,
} from "@amigo/db";

const RESTORE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Soft-delete a non-owner member, then clean up denormalized display names and
 * push subscriptions. Call Clerk metadata clearing between claim and cleanup so
 * a Clerk failure can restore the membership without losing push rows.
 */
export async function claimNonOwnerSoftDelete(
  db: DrizzleD1,
  userId: string,
  householdId: string
): Promise<boolean> {
  const restoreAllowedUntil = new Date(Date.now() + RESTORE_GRACE_MS);
  const claimed = await db
    .update(users)
    .set({ deletedAt: new Date(), restoreAllowedUntil })
    .where(
      and(
        eq(users.id, userId),
        scopeToHousehold(users.householdId, householdId),
        isNull(users.deletedAt),
        ne(users.role, "owner")
      )
    )
    .returning({ id: users.id })
    .get();

  return claimed != null;
}

export async function restoreSoftDeleteClaim(
  db: DrizzleD1,
  userId: string
): Promise<void> {
  await db
    .update(users)
    .set({ deletedAt: null, restoreAllowedUntil: null })
    .where(eq(users.id, userId));
}

export async function cleanupDepartedMemberData(
  db: DrizzleD1,
  userId: string,
  displayName: string
): Promise<void> {
  await db.batch([
    db
      .update(transactions)
      .set({ userDisplayName: displayName })
      .where(eq(transactions.userId, userId)),
    db
      .update(recurringTransactions)
      .set({ userDisplayName: displayName })
      .where(eq(recurringTransactions.userId, userId)),
    db
      .update(assets)
      .set({ userDisplayName: displayName })
      .where(eq(assets.userId, userId)),
    db
      .update(debts)
      .set({ userDisplayName: displayName })
      .where(eq(debts.userId, userId)),
    db
      .update(groceryItems)
      .set({ createdByUserDisplayName: displayName })
      .where(eq(groceryItems.createdByUserId, userId)),
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
  ]);
}
