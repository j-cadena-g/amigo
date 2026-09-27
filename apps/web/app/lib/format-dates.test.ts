import { describe, expect, it } from "vitest";
import {
  capitalizeFirst,
  formatLedgerDate,
  formatRelativeDate,
  formatTransactionDate,
  ledgerDateColumnWidth,
} from "./format-dates";

describe("formatRelativeDate", () => {
  it("labels dates relative to household today", () => {
    expect(formatRelativeDate("2026-06-16", "2026-06-16", "en-CA")).toBe("Today");
    expect(formatRelativeDate("2026-06-15", "2026-06-16", "en-CA")).toBe("Yesterday");
    expect(formatRelativeDate("2026-06-17", "2026-06-16", "en-CA")).toBe("Tomorrow");
    expect(formatRelativeDate("2026-06-10", "2026-06-16", "en-CA")).toBe("6d ago");
  });

  it("falls back to short absolute dates outside the relative window", () => {
    expect(formatRelativeDate("2026-05-11", "2026-06-16", "en-CA")).toBe("May 11");
  });
});

describe("ledger dates", () => {
  it("follow the viewer's locale", () => {
    expect(formatLedgerDate("2026-09-23", "en-US")).toBe("Sep 23");
    expect(formatLedgerDate("2026-09-23T14:00:00Z", "es-CO")).toBe("23 sept");
    expect(formatLedgerDate("2026-09-23", "de-DE")).toBe("23. Sept.");
    expect(formatTransactionDate("2026-09-23", "en-US")).toBe("Sep 23, 2026");
    expect(formatTransactionDate("2026-09-23", "es-CO")).toBe("23 de sept de 2026");
  });
});

describe("capitalizeFirst", () => {
  it("capitalizes lowercase month names for headings", () => {
    expect(capitalizeFirst("septiembre de 2026", "es-CO")).toBe("Septiembre de 2026");
    expect(capitalizeFirst("September 2026", "en-CA")).toBe("September 2026");
    expect(capitalizeFirst("", "en-CA")).toBe("");
  });
});

describe("ledgerDateColumnWidth", () => {
  it("keeps the English column and widens for longer month names", () => {
    expect(ledgerDateColumnWidth("en-CA")).toBe("max(3.5rem, 6ch)");
    expect(ledgerDateColumnWidth("es-CO")).toBe("max(3.5rem, 7ch)");
    expect(ledgerDateColumnWidth("de-DE")).toBe("max(3.5rem, 9ch)");
  });
});
