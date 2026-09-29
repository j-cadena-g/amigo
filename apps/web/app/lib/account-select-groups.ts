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

function groupKeyFor(type: string): AccountSelectGroupKey {
  if (isCashAndBankType(type)) return "cashAndBank";
  if (type === "CREDIT") return "creditCards";
  if (type === "LOAN") return "loans";
  return "investmentsAndProperty";
}

/** The non-empty groups of `accounts`, in display order, keeping each group's input order. */
export function groupAccountsForSelect<T extends { type: string }>(
  accounts: readonly T[]
): { key: AccountSelectGroupKey; accounts: T[] }[] {
  return GROUP_KEYS.map((key) => ({
    key,
    accounts: accounts.filter((a) => groupKeyFor(a.type) === key),
  })).filter((group) => group.accounts.length > 0);
}
