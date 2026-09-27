import type { FinancialAccount } from "@amigo/db";
import type { Messages } from "@/app/i18n";

/** Types shown in add/edit selects (excludes legacy OTHER). */
export const ACCOUNT_TYPE_SELECT_VALUES = [
  "CHECKING",
  "SAVINGS",
  "CASH",
  "INVESTMENT",
  "PROPERTY",
] as const satisfies readonly FinancialAccount["type"][];

export type AccountTypeSelectValue = (typeof ACCOUNT_TYPE_SELECT_VALUES)[number];

/** Types for an account's select, keeping legacy OTHER when it already has it. */
export function getAccountTypeSelectValues(currentType?: string): FinancialAccount["type"][] {
  const values: FinancialAccount["type"][] = [...ACCOUNT_TYPE_SELECT_VALUES];
  if (currentType === "OTHER") values.push("OTHER");
  return values;
}

export function accountTypeLabel(type: string, t: Messages): string {
  const labels: Record<string, string> = t.accounts.types;
  return labels[type] ?? type.replace(/_/g, " ").toLowerCase();
}

export function isAssetHoldingType(type: string): boolean {
  return type === "INVESTMENT" || type === "PROPERTY";
}

/** Bank/cash account types on the Accounts tab (credit cards belong under Debts). */
export const TRANSACTIONAL_ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CASH",
] as const satisfies readonly FinancialAccount["type"][];

/** Bank/cash accounts on the Accounts tab (credit cards belong under Debts). */
export function isTransactionalAccountType(type: string): boolean {
  return (TRANSACTIONAL_ACCOUNT_TYPES as readonly string[]).includes(type);
}
