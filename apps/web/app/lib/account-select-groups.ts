import { isCashAndBankType } from "@/app/lib/financial-account-types";

export type AccountSelectGroupKey =
  | "cashAndBank"
  | "creditCards"
  | "loans"
  | "investmentsAndProperty";

/** Groups in display order; each shows only when it has accounts. */
const GROUP_KEYS: readonly AccountSelectGroupKey[] = [
  "cashAndBank",
  "creditCards",
  "loans",
  "investmentsAndProperty",
];

/** Expenses are paid from cash or a bank account, or charged to a credit card. */
export const EXPENSE_ACCOUNT_GROUPS: readonly AccountSelectGroupKey[] = ["cashAndBank", "creditCards"];

function groupKeyFor(type: string): AccountSelectGroupKey {
  if (isCashAndBankType(type)) return "cashAndBank";
  if (type === "CREDIT") return "creditCards";
  if (type === "LOAN") return "loans";
  return "investmentsAndProperty";
}

/**
 * The non-empty groups of `accounts`, in display order, keeping each group's input order.
 * With `only`, other groups are left out, except for the account `keepId` (an existing link).
 */
export function groupAccountsForSelect<T extends { id: string; type: string }>(
  accounts: readonly T[],
  only?: readonly AccountSelectGroupKey[],
  keepId?: string | null
): { key: AccountSelectGroupKey; accounts: T[] }[] {
  return GROUP_KEYS.map((key) => ({
    key,
    accounts: accounts.filter(
      (a) => groupKeyFor(a.type) === key && (!only || only.includes(key) || a.id === keepId)
    ),
  })).filter((group) => group.accounts.length > 0);
}
