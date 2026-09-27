import type { FinancialAccount } from "@amigo/db";

export type { LegacyAssetType } from "@/server/lib/legacy-asset-migration";
export { mapLegacyAssetTypeToAccountType } from "@/server/lib/legacy-asset-migration";

/** Account types offered when converting a BANK legacy asset. */
export const BANK_CONVERSION_ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
] as const satisfies readonly FinancialAccount["type"][];
