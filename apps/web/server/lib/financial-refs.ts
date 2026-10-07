import {
  and,
  budgets,
  eq,
  financialAccounts,
  inArray,
  isNull,
  scopeToHousehold,
  visibleFinancialAccountsCondition,
  visibleBudgetsCondition,
  type DrizzleD1,
} from "@amigo/db";
import { canHoldExpenses } from "@/app/lib/financial-account-types";
import { ActionError } from "./errors";

export const EXPENSE_ACCOUNT_ERROR =
  "Expenses can only use a cash, bank, or credit card account";

/** Only newly chosen refs need validation; keep an existing (possibly deleted) link. */
export function refsChangedFromExisting(
  validated: {
    budgetId?: string | null;
    accountId?: string | null;
  },
  existing: {
    budgetId: string | null;
    accountId?: string | null;
  }
): {
  budgetId?: string | null;
  accountId?: string | null;
} {
  const refs: {
    budgetId?: string | null;
    accountId?: string | null;
  } = {};

  if (validated.budgetId !== undefined && validated.budgetId !== existing.budgetId) {
    refs.budgetId = validated.budgetId;
  }
  if (
    validated.accountId !== undefined &&
    validated.accountId !== (existing.accountId ?? null)
  ) {
    refs.accountId = validated.accountId;
  }

  return refs;
}

export async function validateFinancialRefs(
  db: DrizzleD1,
  householdId: string,
  viewerUserId: string,
  refs: {
    budgetId?: string | null;
    accountId?: string | null;
  },
  transactionType?: "income" | "expense"
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
        isNull(financialAccounts.deletedAt),
        visibleFinancialAccountsCondition(viewerUserId)
      ),
    });
    if (!account) {
      throw new ActionError(
        "Unknown or inaccessible account",
        "VALIDATION_ERROR"
      );
    }
    if (transactionType === "expense" && !canHoldExpenses(account.type)) {
      throw new ActionError(EXPENSE_ACCOUNT_ERROR, "VALIDATION_ERROR");
    }
  }
}

/**
 * Turning a transaction into an expense must not leave it on a loan or asset account.
 * A deleted account is a kept link, like in `refsChangedFromExisting`.
 */
export async function assertKeptAccountHoldsExpenses(
  db: DrizzleD1,
  householdId: string,
  accountId: string
): Promise<void> {
  const account = await db.query.financialAccounts.findFirst({
    where: and(
      eq(financialAccounts.id, accountId),
      scopeToHousehold(financialAccounts.householdId, householdId),
      isNull(financialAccounts.deletedAt)
    ),
    columns: { type: true },
  });
  if (account && !canHoldExpenses(account.type)) {
    throw new ActionError(EXPENSE_ACCOUNT_ERROR, "VALIDATION_ERROR");
  }
}

export async function validateImportBudgetAndAccountIds(
  db: DrizzleD1,
  householdId: string,
  viewerUserId: string,
  rows: { budgetId?: string | null; accountId?: string | null; type?: string }[]
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
      .select({ id: financialAccounts.id, type: financialAccounts.type })
      .from(financialAccounts)
      .where(
        and(
          scopeToHousehold(financialAccounts.householdId, householdId),
          inArray(financialAccounts.id, accountIds),
          isNull(financialAccounts.deletedAt),
          visibleFinancialAccountsCondition(viewerUserId)
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
    const typeById = new Map(found.map((r) => [r.id, r.type]));
    const misplacedExpense = rows.some(
      (r) =>
        r.type === "expense" &&
        r.accountId &&
        !canHoldExpenses(typeById.get(r.accountId)!)
    );
    if (misplacedExpense) {
      throw new ActionError(EXPENSE_ACCOUNT_ERROR, "VALIDATION_ERROR");
    }
  }
}
