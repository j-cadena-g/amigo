import type { CurrencyCode } from "@amigo/db";
import { calculateHomeCents } from "@/app/lib/currency";

interface CreditCardBalance {
  type: "LOAN" | "CREDIT_CARD";
  balanceInitial: number;
  balanceCurrent: number;
  currency: CurrencyCode;
  exchangeRateToHome: number | null;
}

export interface CreditCardSummary {
  cardCount: number;
  totalLimitCents: number;
  availableCreditCents: number;
  usedCreditCents: number;
  percentageUsed: number;
}

export function getCreditCardSummary(
  debts: CreditCardBalance[]
): CreditCardSummary | null {
  let cardCount = 0;
  let totalLimitCents = 0;
  let availableCreditCents = 0;

  for (const debt of debts) {
    if (debt.type !== "CREDIT_CARD") continue;

    cardCount += 1;
    totalLimitCents += calculateHomeCents(
      debt.balanceInitial,
      debt.exchangeRateToHome
    );
    availableCreditCents += calculateHomeCents(
      debt.balanceCurrent,
      debt.exchangeRateToHome
    );
  }

  if (cardCount === 0) return null;

  const usedCreditCents = Math.max(0, totalLimitCents - availableCreditCents);
  const percentageUsed =
    totalLimitCents > 0 ? (usedCreditCents / totalLimitCents) * 100 : 0;

  return {
    cardCount,
    totalLimitCents,
    availableCreditCents,
    usedCreditCents,
    percentageUsed,
  };
}
