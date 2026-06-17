import { eq, isNull, or, sql } from "drizzle-orm";
import { budgets, financialAccounts, recurringTransactions, transactions } from "./schema";

/**
 * Transactions visible to a household member: their own rows, plus any row
 * assigned to a household-shared budget (budget.userId IS NULL).
 * Rows with `budgetId` NULL are only matched by `eq(transactions.userId, …)` (owner-only).
 */
export function visibleFinancialTransactionsCondition(viewerUserId: string) {
  return or(
    eq(transactions.userId, viewerUserId),
    sql`EXISTS (SELECT 1 FROM ${budgets} WHERE ${budgets.id} = ${transactions.budgetId} AND ${budgets.userId} IS NULL AND ${budgets.deletedAt} IS NULL)`
  );
}

/** Budget rows the member can see: personal (theirs) or household-shared. */
export function visibleBudgetsCondition(viewerUserId: string) {
  return or(eq(budgets.userId, viewerUserId), isNull(budgets.userId));
}

/** Account rows the member can reference: personal (theirs) or household-shared. */
export function visibleFinancialAccountsCondition(viewerUserId: string) {
  return or(eq(financialAccounts.userId, viewerUserId), isNull(financialAccounts.userId));
}

/**
 * Recurring rules: the member's own rules, plus optional household-shared
 * rules (userId IS NULL) for forward compatibility / restored data.
 */
export function visibleRecurringRulesCondition(viewerUserId: string) {
  return or(eq(recurringTransactions.userId, viewerUserId), isNull(recurringTransactions.userId));
}
