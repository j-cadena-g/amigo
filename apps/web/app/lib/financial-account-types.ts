import type { FinancialAccount } from "@amigo/db";
import type { Messages } from "@/app/i18n";

/** Types shown in add/edit selects, in display order (excludes legacy OTHER). */
export const ACCOUNT_TYPE_SELECT_VALUES = [
  "CHECKING",
  "SAVINGS",
  "CASH",
  "CREDIT",
  "LOAN",
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

/** Bank and cash types, plus legacy OTHER, listed under "Cash & bank" on the Accounts tab. */
export const CASH_AND_BANK_ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CASH",
  "OTHER",
] as const satisfies readonly FinancialAccount["type"][];

export function isCashAndBankType(type: string): boolean {
  return (CASH_AND_BANK_ACCOUNT_TYPES as readonly string[]).includes(type);
}
