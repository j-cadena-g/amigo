import { redis } from "./redis";
import { db, eq, and, isNull, sql } from "@amigo/db";
import {
  transactions,
  recurringTransactions,
  budgets,
  assets,
  debts,
  groceryItems,
} from "@amigo/db/schema";

const PENDING_RESTORE_PREFIX = "pending_restore:";
const PENDING_RESTORE_TTL = 60 * 15; // 15 minutes

export interface OrphanedDataSummary {
  transactions: number;
  recurringTransactions: number;
  budgets: number;
  assets: number;
  debts: number;
  groceryItems: number;
  total: number;
}

export interface PendingRestoreData {
  userId: string;
  householdId: string;
  authId: string;
  email: string;
  name: string | null;
  dataSummary: OrphanedDataSummary;
}

function getPendingRestoreKey(token: string): string {
  return `${PENDING_RESTORE_PREFIX}${token}`;
}

/**
 * Count orphaned data for a soft-deleted user.
 * Since soft delete doesn't trigger ON DELETE SET NULL, the userId FK remains intact.
 * We find orphaned data by querying records where userId matches the deleted user.
 */
export async function getOrphanedDataSummary(
  userId: string,
  householdId: string
): Promise<OrphanedDataSummary> {
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
        and(
          eq(transactions.userId, userId),
          eq(transactions.householdId, householdId),
          isNull(transactions.deletedAt)
        )
      )
      .then((r) => r[0]?.count ?? 0),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.userId, userId),
          eq(recurringTransactions.householdId, householdId)
        )
      )
      .then((r) => r[0]?.count ?? 0),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, userId),
          eq(budgets.householdId, householdId),
          isNull(budgets.deletedAt)
        )
      )
      .then((r) => r[0]?.count ?? 0),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(assets)
      .where(
        and(
          eq(assets.userId, userId),
          eq(assets.householdId, householdId),
          isNull(assets.deletedAt)
        )
      )
      .then((r) => r[0]?.count ?? 0),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(debts)
      .where(
        and(
          eq(debts.userId, userId),
          eq(debts.householdId, householdId),
          isNull(debts.deletedAt)
        )
      )
      .then((r) => r[0]?.count ?? 0),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(groceryItems)
      .where(
        and(
          eq(groceryItems.createdByUserId, userId),
          eq(groceryItems.householdId, householdId),
          isNull(groceryItems.deletedAt)
        )
      )
      .then((r) => r[0]?.count ?? 0),
  ]);

  return {
    transactions: transactionCount,
    recurringTransactions: recurringCount,
    budgets: budgetCount,
    assets: assetCount,
    debts: debtCount,
    groceryItems: groceryCount,
    total:
      transactionCount +
      recurringCount +
      budgetCount +
      assetCount +
      debtCount +
      groceryCount,
  };
}

/**
 * Create a pending restore token stored in Valkey.
 * Returns the token that should be set as a cookie.
 */
export async function createPendingRestoreToken(
  data: PendingRestoreData
): Promise<string> {
  const token = crypto.randomUUID();

  await redis.setex(
    getPendingRestoreKey(token),
    PENDING_RESTORE_TTL,
    JSON.stringify(data)
  );

  return token;
}

/**
 * Retrieve pending restore data from Valkey using the token.
 * Returns null if token is invalid or expired.
 */
export async function getPendingRestoreData(
  token: string
): Promise<PendingRestoreData | null> {
  const data = await redis.get(getPendingRestoreKey(token));

  if (!data) {
    return null;
  }

  return JSON.parse(data) as PendingRestoreData;
}

/**
 * Delete the pending restore token after use.
 */
export async function deletePendingRestoreToken(token: string): Promise<void> {
  await redis.del(getPendingRestoreKey(token));
}

export const PENDING_RESTORE_COOKIE = "pending_restore_token";
