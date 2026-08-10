import { describe, expect, it } from "vitest";
import { formatCents } from "@/app/lib/currency";
import {
  auditTimestampIso,
  formatAuditAction,
  formatAuditFieldName,
  formatAuditTimestamp,
  formatAuditValue,
  resolveAuditEntryCurrencies,
  resolveAuditTimeZone,
  sideCurrenciesFromAuditChanges,
  visibleAuditChanges,
} from "./audit-history";

describe("audit history helpers", () => {
  it("labels standard audit actions", () => {
    expect(formatAuditAction("INSERT")).toBe("Created");
    expect(formatAuditAction("UPDATE")).toBe("Updated");
    expect(formatAuditAction("DELETE")).toBe("Deleted");
  });

  it("humanizes field names", () => {
    expect(formatAuditFieldName("isShared")).toBe("Is Shared");
    expect(formatAuditFieldName("userId")).toBe("User Id");
  });

  it("formats primitive values", () => {
    expect(formatAuditValue(null)).toBe("—");
    expect(formatAuditValue(true)).toBe("Yes");
    expect(formatAuditValue(false)).toBe("No");
    expect(formatAuditValue("")).toBe("—");
    expect(formatAuditValue("Checking")).toBe("Checking");
    const fn = () => "x";
    expect(formatAuditValue(fn)).toBe(String(fn));
  });

  it("formats monetary cents fields with denomination-aware currency", () => {
    expect(
      formatAuditValue(100, { field: "balance", currency: "CAD" })
    ).toBe(formatCents(100, "CAD"));
    expect(
      formatAuditValue(200, { field: "amount", currency: "USD" })
    ).toBe(formatCents(200, "USD"));
    expect(
      formatAuditValue(300, {
        field: "limitAmountHome",
        currency: "USD",
        homeCurrency: "CAD",
      })
    ).toBe(formatCents(300, "CAD"));
    // Without home currency, avoid mislabeling with record currency.
    expect(formatAuditValue(400, { field: "limitAmountHome", currency: "USD" })).toBe(
      "4.00"
    );
    expect(formatAuditValue(15, { field: "dayOfMonth" })).toBe("15");
  });

  it("reads side-specific currencies from change sets", () => {
    expect(
      sideCurrenciesFromAuditChanges({
        currency: { from: "USD", to: "CAD" },
      })
    ).toEqual({ from: "USD", to: "CAD" });
  });

  it("uses snapshot currency for amount-only updates, then change-set currency", () => {
    // Amount changed, currency unchanged → only amount in changes.
    expect(
      resolveAuditEntryCurrencies(
        { amount: { from: 100, to: 200 } },
        { from: "USD", to: "USD" }
      )
    ).toEqual({ from: "USD", to: "USD" });

    // Later currency change should win over snapshots.
    expect(
      resolveAuditEntryCurrencies(
        {
          amount: { from: 200, to: 200 },
          currency: { from: "USD", to: "CAD" },
        },
        { from: "USD", to: "CAD" }
      )
    ).toEqual({ from: "USD", to: "CAD" });

    expect(
      formatAuditValue(200, {
        field: "amount",
        currency: resolveAuditEntryCurrencies(
          { amount: { from: 100, to: 200 } },
          { from: "USD", to: "USD" }
        ).to,
      })
    ).toBe(formatCents(200, "USD"));
  });

  it("hides noise fields from change lists", () => {
    const visible = visibleAuditChanges({
      name: { from: "A", to: "B" },
      updatedAt: { from: 1, to: 2 },
      householdId: { from: "h1", to: "h1" },
      balance: { from: 100, to: 200 },
    });
    expect(visible.map(([key]) => key)).toEqual(["name", "balance"]);
  });

  it("guards invalid timestamps and time zones", () => {
    expect(formatAuditTimestamp(Number.NaN)).toBeNull();
    expect(auditTimestampIso(Number.NaN)).toBeNull();
    expect(resolveAuditTimeZone("Not/AZone")).toBe("UTC");
    expect(formatAuditTimestamp(0, "Not/AZone")).toContain("1970");
  });
});
