import { describe, expect, it } from "vitest";
import { describeMemberData, type MemberDataSummary } from "./member-data-summary";

const EMPTY: MemberDataSummary = {
  transactions: 0,
  recurringTransactions: 0,
  personalBudgets: 0,
  assets: 0,
  debts: 0,
  groceryItems: 0,
};

describe("describeMemberData", () => {
  it("lists non-zero counts in a fixed order", () => {
    expect(
      describeMemberData({
        ...EMPTY,
        groceryItems: 4,
        transactions: 12,
        personalBudgets: 2,
      })
    ).toBe("12 transactions, 2 budgets, and 4 grocery items");
  });

  it("joins two counts without a comma", () => {
    expect(describeMemberData({ ...EMPTY, assets: 2, debts: 3 })).toBe(
      "2 assets and 3 debts"
    );
  });

  it("uses the singular for one", () => {
    expect(
      describeMemberData({
        transactions: 1,
        recurringTransactions: 1,
        personalBudgets: 1,
        assets: 1,
        debts: 1,
        groceryItems: 1,
      })
    ).toBe(
      "1 transaction, 1 recurring rule, 1 budget, 1 asset, 1 debt, and 1 grocery item"
    );
  });

  it("is empty when the member added nothing", () => {
    expect(describeMemberData(EMPTY)).toBe("");
  });
});
