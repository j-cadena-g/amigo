import {
  and,
  budgets,
  eq,
  financialAccounts,
  inArray,
  isNull,
  scopeToHousehold,
  visibleBudgetsCondition,
  type DrizzleD1,
} from "@amigo/db";
import { ActionError } from "./errors";

export async function validateFinancialRefs(
  db: DrizzleD1,
  householdId: string,
  viewerUserId: string,
  refs: {
    budgetId?: string | null;
    accountId?: string | null;
  }
): Promise<void> {
  const budgetId = refs.budgetId || null;
  const accountId = refs.accountId || null;

  if (budgetId) {
    const budget = await db.query.budgets.findFirst({
      where: and(
        eq(budgets.id, budgetId),
        scopeToHousehold(budgets.householdId, householdId),
        isNull(budgets.deletedAt),
        visibleBudgetsCondition(viewerUserId)
      ),
    });
    if (!budget) {
      throw new ActionError(
        "Unknown or inaccessible budget",
        "VALIDATION_ERROR"
      );
    }
  }

  if (accountId) {
    const account = await db.query.financialAccounts.findFirst({
      where: and(
        eq(financialAccounts.id, accountId),
        scopeToHousehold(financialAccounts.householdId, householdId),
        isNull(financialAccounts.deletedAt)
      ),
    });
    if (!account) {
      throw new ActionError(
        "Unknown or inaccessible account",
        "VALIDATION_ERROR"
      );
    }
  }
}

export async function validateImportBudgetAndAccountIds(
  db: DrizzleD1,
  householdId: string,
  viewerUserId: string,
  rows: { budgetId?: string | null; accountId?: string | null }[]
): Promise<void> {
  const budgetIds = [
    ...new Set(rows.map((r) => r.budgetId).filter((id): id is string => Boolean(id))),
  ];
  const accountIds = [
    ...new Set(rows.map((r) => r.accountId).filter((id): id is string => Boolean(id))),
  ];

  if (budgetIds.length > 0) {
    const found = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          scopeToHousehold(budgets.householdId, householdId),
          inArray(budgets.id, budgetIds),
          isNull(budgets.deletedAt),
          visibleBudgetsCondition(viewerUserId)
        )
      );
    const ok = new Set(found.map((r) => r.id));
    const missing = budgetIds.filter((id) => !ok.has(id));
    if (missing.length > 0) {
      throw new ActionError(
        `Unknown or inaccessible budget(s): ${missing.join(", ")}`,
        "VALIDATION_ERROR"
      );
    }
  }

  if (accountIds.length > 0) {
    const found = await db
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(
        and(
          scopeToHousehold(financialAccounts.householdId, householdId),
          inArray(financialAccounts.id, accountIds),
          isNull(financialAccounts.deletedAt)
        )
      );
    const ok = new Set(found.map((r) => r.id));
    const missing = accountIds.filter((id) => !ok.has(id));
    if (missing.length > 0) {
      throw new ActionError(
        `Unknown or inaccessible account(s): ${missing.join(", ")}`,
        "VALIDATION_ERROR"
      );
    }
  }
}
