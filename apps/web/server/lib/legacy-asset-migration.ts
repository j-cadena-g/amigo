import type { FinancialAccount } from "@amigo/db";

export type LegacyAssetType = "BANK" | "INVESTMENT" | "CASH" | "PROPERTY";

/** Deterministic account id so convert retries are idempotent. */
export function convertedAccountIdForAsset(assetId: string): string {
  return `from-asset-${assetId}`;
}

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

export function isLegacyAssetType(value: string): value is LegacyAssetType {
  return (
    value === "BANK" ||
    value === "INVESTMENT" ||
    value === "CASH" ||
    value === "PROPERTY"
  );
}
