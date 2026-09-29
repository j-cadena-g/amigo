import { describe, expect, it } from "vitest";
import { chargePayload, type TransactionFormState } from "./transaction-form";

function form(overrides: Partial<TransactionFormState>): TransactionFormState {
  return {
    amount: "40",
    description: "",
    categoryId: "cat",
    type: "expense",
    date: "2026-09-27",
    budgetId: null,
    accountId: null,
    currency: "USD",
    chargedAmount: "",
    chargedCurrency: null,
    ...overrides,
  };
}

describe("chargePayload", () => {
  it("sends the charge in home currency cents by default", () => {
    expect(chargePayload(form({ chargedAmount: "55,35" }), "CAD")).toEqual({
      chargedAmount: 5535,
      chargedCurrency: "CAD",
    });
  });

  it("sends a charge in the currency picked for it", () => {
    expect(
      chargePayload(form({ currency: "COP", chargedAmount: "12.40", chargedCurrency: "USD" }), "CAD")
    ).toEqual({ chargedAmount: 1240, chargedCurrency: "USD" });
  });

  it("clears the charge when the field is blank", () => {
    expect(chargePayload(form({}), "CAD")).toEqual({ chargedAmount: null });
  });

  it("clears the charge once the amount is in home currency with no other charge currency", () => {
    expect(chargePayload(form({ currency: "CAD", chargedAmount: "55.35" }), "CAD")).toEqual({
      chargedAmount: null,
    });
  });

  it("keeps a foreign charge on a home-currency row", () => {
    expect(
      chargePayload(form({ currency: "CAD", chargedAmount: "38", chargedCurrency: "USD" }), "CAD")
    ).toEqual({ chargedAmount: 3800, chargedCurrency: "USD" });
  });
});
