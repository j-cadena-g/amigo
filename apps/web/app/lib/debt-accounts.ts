import type { CurrencyCode, FinancialAccount } from "@amigo/db";
import type { Debt } from "@/app/components/debt-cards";

type DebtKind = Debt["type"];

/**
 * A credit card or loan account as the Debts page shows it. Accounts store what
 * the account is worth to the household (negative when money is owed); the page
 * shows the card limit / loan amount and the available credit / total paid.
 * A missing limit or loan amount counts as the amount owed, so available/paid is 0.
 */
export function debtFromAccount(
  account: Pick<
    FinancialAccount,
    | "id"
    | "name"
    | "type"
    | "balance"
    | "creditLimit"
    | "originalAmount"
    | "currency"
    | "exchangeRateToHome"
    | "userId"
    | "createdAt"
  >
): Debt {
  const isCard = account.type === "CREDIT";
  const initial =
    (isCard ? account.creditLimit : account.originalAmount) ?? Math.max(0, -account.balance);
  return {
    id: account.id,
    name: account.name,
    type: isCard ? "CREDIT_CARD" : "LOAN",
    balanceInitial: initial,
    balanceCurrent: initial + account.balance,
    currency: account.currency,
    exchangeRateToHome: account.exchangeRateToHome,
    userId: account.userId,
    isShared: account.userId === null,
    createdAt: account.createdAt,
  };
}

interface DebtAccountInput {
  kind: DebtKind;
  name: string;
  currency: CurrencyCode;
  isShared: boolean;
  /** Loan amount or credit limit, in dollars. */
  initial: number;
  /** Total paid or available credit, in dollars. */
  current: number;
}

/** Body for POST /api/accounts and PATCH /api/accounts/:id (dollars). */
export function debtAccountBody({
  kind,
  name,
  currency,
  isShared,
  initial,
  current,
}: DebtAccountInput) {
  // Owed = initial - current, stored negative; rounded to cents to drop float noise.
  const balance = Math.round((current - initial) * 100) / 100;
  return kind === "LOAN"
    ? { type: "LOAN" as const, name, balance, originalAmount: initial, currency, isShared }
    : { type: "CREDIT" as const, name, balance, creditLimit: initial, currency, isShared };
}
