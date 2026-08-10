import type { FinancialAccount } from "@amigo/db";

export type LegacyAssetType = "BANK" | "INVESTMENT" | "CASH" | "PROPERTY";

/** Default account type when converting a legacy asset. BANK maps to CHECKING. */
export function mapLegacyAssetTypeToAccountType(
  assetType: LegacyAssetType
): FinancialAccount["type"] {
  switch (assetType) {
    case "BANK":
      return "CHECKING";
    case "CASH":
      return "CASH";
    case "INVESTMENT":
      return "INVESTMENT";
    case "PROPERTY":
      return "PROPERTY";
    default: {
      const _exhaustive: never = assetType;
      return _exhaustive;
    }
  }
}

/** Account types offered when converting a BANK legacy asset. */
export const BANK_CONVERSION_ACCOUNT_TYPES = [
  { value: "CHECKING" as const, label: "Checking" },
  { value: "SAVINGS" as const, label: "Savings" },
];
