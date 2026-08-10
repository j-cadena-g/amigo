import { describe, expect, it } from "vitest";
import { mapLegacyAssetTypeToAccountType } from "./legacy-asset-migration";

describe("mapLegacyAssetTypeToAccountType", () => {
  it("maps BANK to CHECKING by default", () => {
    expect(mapLegacyAssetTypeToAccountType("BANK")).toBe("CHECKING");
  });

  it("maps CASH, INVESTMENT, and PROPERTY one-to-one", () => {
    expect(mapLegacyAssetTypeToAccountType("CASH")).toBe("CASH");
    expect(mapLegacyAssetTypeToAccountType("INVESTMENT")).toBe("INVESTMENT");
    expect(mapLegacyAssetTypeToAccountType("PROPERTY")).toBe("PROPERTY");
  });
});
