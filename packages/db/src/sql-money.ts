import { sql } from "drizzle-orm";
import { assets, debts, financialAccounts, transactions } from "./schema";

/**
 * Transaction amount in cents converted to household home currency using the
 * FX snapshot on the row (`exchangeRateToHome` is null when already home).
 */
export function sqlTransactionAmountHomeCents() {
  return sql<number>`CASE WHEN ${transactions.exchangeRateToHome} IS NULL THEN ${transactions.amount} ELSE ROUND(CAST(${transactions.amount} AS REAL) * ${transactions.exchangeRateToHome}) END`;
}

export function sqlAssetBalanceHomeCents() {
  return sql<number>`CASE WHEN ${assets.exchangeRateToHome} IS NULL THEN ${assets.balance} ELSE ROUND(CAST(${assets.balance} AS REAL) * ${assets.exchangeRateToHome}) END`;
}

export function sqlFinancialAccountBalanceHomeCents() {
  return sql<number>`CASE WHEN ${financialAccounts.exchangeRateToHome} IS NULL THEN ${financialAccounts.balance} ELSE ROUND(CAST(${financialAccounts.balance} AS REAL) * ${financialAccounts.exchangeRateToHome}) END`;
}

/** Liability in original cents → home cents */
export function sqlDebtLiabilityHomeCents() {
  return sql<number>`CASE WHEN ${debts.exchangeRateToHome} IS NULL THEN (${debts.balanceInitial} - ${debts.balanceCurrent}) ELSE ROUND(CAST((${debts.balanceInitial} - ${debts.balanceCurrent}) AS REAL) * ${debts.exchangeRateToHome}) END`;
}
