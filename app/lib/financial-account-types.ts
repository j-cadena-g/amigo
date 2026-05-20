import type { FinancialAccount } from "@amigo/db";

/** Types shown in add/edit selects (excludes legacy OTHER). */
export const ACCOUNT_TYPE_SELECT_OPTIONS: readonly {
  value: FinancialAccount["type"];
  label: string;
}[] = [
  { value: "CHECKING", label: "Checking" },
  { value: "SAVINGS", label: "Savings" },
  { value: "CASH", label: "Cash" },
  { value: "CREDIT", label: "Credit card" },
  { value: "INVESTMENT", label: "Investment" },
  { value: "PROPERTY", label: "Property" },
] as const;

const LABEL_BY_TYPE: Record<string, string> = {
  ...Object.fromEntries(
    ACCOUNT_TYPE_SELECT_OPTIONS.map((o) => [o.value, o.label])
  ),
  OTHER: "Other",
};

export type AccountTypeSelectValue =
  (typeof ACCOUNT_TYPE_SELECT_OPTIONS)[number]["value"];

export function getAccountTypeSelectOptions(
  currentType?: string
): { value: FinancialAccount["type"]; label: string }[] {
  const options = [...ACCOUNT_TYPE_SELECT_OPTIONS];
  if (currentType === "OTHER") {
    options.push({ value: "OTHER", label: "Other" });
  }
  return options;
}

export function accountTypeLabel(type: string): string {
  return LABEL_BY_TYPE[type] ?? type.replace(/_/g, " ").toLowerCase();
}

export function isAssetHoldingType(type: string): boolean {
  return type === "INVESTMENT" || type === "PROPERTY";
}
