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

  it("stores a card's amount owed as a negative balance with its limit", () => {
    expect(
      parseAccountAmounts("CREDIT", { ...empty, amount: "300", creditLimit: "1000", originalAmount: "9" })
    ).toEqual({ balance: -300, creditLimit: 1000 });
  });

  it("stores a loan's amount owed as a negative balance with its original amount", () => {
    expect(
      parseAccountAmounts("LOAN", { ...empty, amount: "8.000,25", creditLimit: "9", originalAmount: "10.000" })
    ).toEqual({ balance: -8000.25, originalAmount: 10000 });
  });

  it("turns a negative amount owed into a credit balance", () => {
    expect(parseAccountAmounts("CREDIT", { ...empty, amount: "-25" })).toEqual({
      balance: 25,
      creditLimit: null,
    });
  });

  it("sends null for an empty limit or original amount so an edit can clear it", () => {
    expect(parseAccountAmounts("CREDIT", { ...empty, amount: "10" })).toEqual({
      balance: -10,
      creditLimit: null,
    });
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
    expect(parseAccountAmounts("LOAN", { ...empty, amount: "1", originalAmount: "0" })).toEqual({
      error: "limit",
    });
  });
});
