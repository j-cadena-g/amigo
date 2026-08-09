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

export type SoftDeleteClaim = {
  userId: string;
  householdId: string;
  deletedAt: Date;
};

/**
 * Soft-delete a non-owner member. Returns a claim token that must be used for
 * restore so a delayed failure cannot clear a later soft-delete of the same user.
 */
export async function claimNonOwnerSoftDelete(
  db: DrizzleD1,
  userId: string,
  householdId: string
): Promise<SoftDeleteClaim | null> {
  const deletedAt = new Date();
  const restoreAllowedUntil = new Date(deletedAt.getTime() + RESTORE_GRACE_MS);
  const claimed = await db
    .update(users)
    .set({ deletedAt, restoreAllowedUntil })
    .where(
      and(
        eq(users.id, userId),
        scopeToHousehold(users.householdId, householdId),
        isNull(users.deletedAt),
        ne(users.role, "owner")
      )
    )
    .returning({ id: users.id, deletedAt: users.deletedAt })
    .get();

  if (!claimed?.deletedAt) return null;
  return {
    userId,
    householdId,
    deletedAt: claimed.deletedAt,
  };
}

/** Restores only when the row still matches the exact claim token. */
export async function restoreSoftDeleteClaim(
  db: DrizzleD1,
  claim: SoftDeleteClaim
): Promise<boolean> {
  const restored = await db
    .update(users)
    .set({ deletedAt: null, restoreAllowedUntil: null })
    .where(
      and(
        eq(users.id, claim.userId),
        scopeToHousehold(users.householdId, claim.householdId),
        eq(users.deletedAt, claim.deletedAt)
      )
    )
    .returning({ id: users.id })
    .get();

  return restored != null;
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
