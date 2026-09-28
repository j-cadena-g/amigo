import { sql } from "drizzle-orm";
import { financialAccounts, transactions } from "./schema";

/**
 * Transaction amount in household home currency cents: what the card actually
 * charged when recorded (converted with its own FX snapshot if it was charged
 * in another currency), else `amount` with the row's FX snapshot. Snapshots
 * are null when already home.
 */
export function sqlTransactionAmountHomeCents() {
  return sql<number>`CASE WHEN ${transactions.chargedAmount} IS NOT NULL THEN (CASE WHEN ${transactions.chargedExchangeRateToHome} IS NULL THEN ${transactions.chargedAmount} ELSE ROUND(CAST(${transactions.chargedAmount} AS REAL) * ${transactions.chargedExchangeRateToHome}) END) WHEN ${transactions.exchangeRateToHome} IS NULL THEN ${transactions.amount} ELSE ROUND(CAST(${transactions.amount} AS REAL) * ${transactions.exchangeRateToHome}) END`;
}

export function sqlFinancialAccountBalanceHomeCents() {
  return sql<number>`CASE WHEN ${financialAccounts.exchangeRateToHome} IS NULL THEN ${financialAccounts.balance} ELSE ROUND(CAST(${financialAccounts.balance} AS REAL) * ${financialAccounts.exchangeRateToHome}) END`;
}
