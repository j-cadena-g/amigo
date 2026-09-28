import { isLiabilityAccountType } from "@amigo/db";
import { calculateHomeCents } from "@/app/lib/currency";

/** The fields of a live, unarchived account the balance sheet needs. */
export interface SummaryAccount {
  type: string;
  /** What the account is worth to the household, in cents: negative when money is owed. */
  balance: number;
  /** Credit limit in cents; null when unknown or not a card. */
  creditLimit: number | null;
  exchangeRateToHome: number | null;
}

/** Credit cards with a known limit, in home-currency cents. */
export interface CreditUsage {
  cardCount: number;
  limitCents: number;
  /** Owed across the cards; a card with a credit balance counts as 0, not as negative. */
  owedCents: number;
  /** Limit minus owed. */
  availableCents: number;
  percentUsed: number;
}

export interface AccountsSummary {
  assetsCents: number;
  /** Positive amount owed on credit cards and loans. */
  liabilitiesCents: number;
  netWorthCents: number;
  creditUsage: CreditUsage | null;
}

/** Signed sum of balances in home-currency cents, e.g. for one section's total. */
export function sumBalancesHomeCents(
  accounts: readonly Pick<SummaryAccount, "balance" | "exchangeRateToHome">[]
): number {
  return accounts.reduce(
    (sum, a) => sum + calculateHomeCents(a.balance, a.exchangeRateToHome),
    0
  );
}

/** Balance sheet over live, unarchived accounts, all in home-currency cents. */
export function summarizeAccounts(accounts: readonly SummaryAccount[]): AccountsSummary {
  const liabilities = accounts.filter((a) => isLiabilityAccountType(a.type));
  const assetsCents = sumBalancesHomeCents(accounts.filter((a) => !isLiabilityAccountType(a.type)));
  // 0 - x rather than -x, which would turn a zero total into -0.
  const liabilitiesCents = 0 - sumBalancesHomeCents(liabilities);

  let cardCount = 0;
  let limitCents = 0;
  let owedCents = 0;
  for (const account of liabilities) {
    if (account.type !== "CREDIT" || account.creditLimit === null) continue;
    cardCount += 1;
    limitCents += calculateHomeCents(account.creditLimit, account.exchangeRateToHome);
    owedCents += Math.max(0, -calculateHomeCents(account.balance, account.exchangeRateToHome));
  }

  return {
    assetsCents,
    liabilitiesCents,
    netWorthCents: assetsCents - liabilitiesCents,
    creditUsage:
      cardCount === 0
        ? null
        : {
            cardCount,
            limitCents,
            owedCents,
            availableCents: limitCents - owedCents,
            percentUsed: limitCents > 0 ? (owedCents / limitCents) * 100 : 0,
          },
  };
}
