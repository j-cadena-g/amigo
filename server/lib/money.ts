import type { DrizzleD1 } from "@amigo/db";
import type { CurrencyCode } from "@amigo/db";
import type { Env } from "../env";
import { getExchangeRateForRecord } from "./exchange-rates";
import { getHomeCurrency } from "./household-currency";

export {
  sqlAssetBalanceHomeCents,
  sqlDebtLiabilityHomeCents,
  sqlTransactionAmountHomeCents,
} from "@amigo/db";

/**
 * Budget limit in home currency cents at save time (paired with
 * `limitAmount` in the budget's own currency).
 */
export async function computeLimitAmountHomeCents(
  env: Env,
  db: DrizzleD1,
  householdId: string,
  limitCentsInBudgetCurrency: number,
  budgetCurrency: CurrencyCode
): Promise<{ limitAmountHome: number; exchangeRateLimitToHome: number | null }> {
  if (
    typeof limitCentsInBudgetCurrency !== "number" ||
    !Number.isFinite(limitCentsInBudgetCurrency) ||
    limitCentsInBudgetCurrency < 0
  ) {
    throw new TypeError(
      "invalid limitCentsInBudgetCurrency: must be a non-negative finite number"
    );
  }
  const home = await getHomeCurrency(db, householdId);
  if (budgetCurrency === home) {
    return { limitAmountHome: limitCentsInBudgetCurrency, exchangeRateLimitToHome: null };
  }
  const rate = await getExchangeRateForRecord(env, budgetCurrency, home);
  if (rate === null) {
    throw new Error(
      `Missing exchange rate from ${budgetCurrency} to ${home} for budget limit conversion`
    );
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(
      `Invalid exchange rate from ${budgetCurrency} to ${home}: ${String(rate)}`
    );
  }
  const raw = Math.round(limitCentsInBudgetCurrency * rate);
  // Non-zero budget limits must not collapse to 0 home cents when FX rounds down.
  const limitAmountHome =
    limitCentsInBudgetCurrency > 0 ? Math.max(1, raw) : raw;
  return {
    limitAmountHome,
    exchangeRateLimitToHome: rate,
  };
}
