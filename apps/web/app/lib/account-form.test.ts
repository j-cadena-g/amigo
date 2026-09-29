import { describe, expect, it } from "vitest";
import { parseAccountAmounts } from "./account-form";

const empty = { amount: "", creditLimit: "", originalAmount: "" };

describe("parseAccountAmounts", () => {
  it("sends only the balance for asset accounts, ignoring stale limit fields", () => {
    expect(
      parseAccountAmounts("CHECKING", {
        amount: "1,250.50",
        creditLimit: "5000",
        originalAmount: "9000",
      })
    ).toEqual({ balance: 1250.5 });
  });

  it("stores a card's available credit against its limit as a negative balance", () => {
    expect(
      parseAccountAmounts("CREDIT", { amount: "700", creditLimit: "1000", originalAmount: "9" })
    ).toEqual({ balance: -300, creditLimit: 1000 });
    expect(
      parseAccountAmounts("CREDIT", { ...empty, amount: "7.134,50", creditLimit: "10.000" })
    ).toEqual({ balance: -2865.5, creditLimit: 10000 });
  });

  it("keeps a card with available credit above its limit as a credit balance", () => {
    expect(parseAccountAmounts("CREDIT", { ...empty, amount: "1025", creditLimit: "1000" })).toEqual({
      balance: 25,
      creditLimit: 1000,
    });
  });

  it("lets available credit go negative for a card over its limit", () => {
    expect(parseAccountAmounts("CREDIT", { ...empty, amount: "-50", creditLimit: "1000" })).toEqual({
      balance: -1050,
      creditLimit: 1000,
    });
  });

  it("stores a paid-off card as a zero balance, not negative zero", () => {
    const result = parseAccountAmounts("CREDIT", { ...empty, amount: "1000", creditLimit: "1000" });
    expect(result).toEqual({ balance: 0, creditLimit: 1000 });
    expect(Object.is((result as { balance: number }).balance, -0)).toBe(false);
  });

  it("needs a card's limit and available credit", () => {
    expect(parseAccountAmounts("CREDIT", { ...empty, amount: "100" })).toEqual({ error: "limit" });
    expect(parseAccountAmounts("CREDIT", { ...empty, creditLimit: "1000" })).toEqual({
      error: "available",
    });
    expect(parseAccountAmounts("CREDIT", { ...empty, amount: "abc", creditLimit: "1000" })).toEqual({
      error: "available",
    });
  });

  it("stores a loan's amount owed as a negative balance with its original amount", () => {
    expect(
      parseAccountAmounts("LOAN", { ...empty, amount: "8.000,25", creditLimit: "9", originalAmount: "10.000" })
    ).toEqual({ balance: -8000.25, originalAmount: 10000 });
  });

  it("sends null for an empty original amount so an edit can clear it", () => {
    expect(parseAccountAmounts("LOAN", { ...empty, amount: "10" })).toEqual({
      balance: -10,
      originalAmount: null,
    });
  });

  it("treats an empty amount as zero without a negative zero", () => {
    expect(parseAccountAmounts("LOAN", empty)).toEqual({ balance: 0, originalAmount: null });
    expect(parseAccountAmounts("SAVINGS", empty)).toEqual({ balance: 0 });
  });

  it("reports which field is not a valid amount", () => {
    expect(parseAccountAmounts("CHECKING", { ...empty, amount: "abc" })).toEqual({ error: "amount" });
    expect(parseAccountAmounts("CREDIT", { ...empty, amount: "1", creditLimit: "x" })).toEqual({
      error: "limit",
    });
    expect(parseAccountAmounts("CREDIT", { ...empty, amount: "1", creditLimit: "0" })).toEqual({
      error: "limit",
    });
    expect(parseAccountAmounts("LOAN", { ...empty, amount: "1", originalAmount: "0" })).toEqual({
      error: "limit",
    });
  });
});
