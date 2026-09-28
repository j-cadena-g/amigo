import { describe, expect, it } from "vitest";
import { describeMemberData, type MemberDataSummary } from "./member-data-summary";

const EMPTY: MemberDataSummary = {
  transactions: 0,
  recurringTransactions: 0,
  personalBudgets: 0,
  accounts: 0,
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
      }, "en")
    ).toBe("12 transactions, 2 budgets, and 4 grocery items");
  });

  it("joins two counts without a comma", () => {
    expect(describeMemberData({ ...EMPTY, accounts: 2, groceryItems: 3 }, "en")).toBe(
      "2 accounts and 3 grocery items"
    );
  });

  it("uses the singular for one", () => {
    expect(
      describeMemberData({
        transactions: 1,
        recurringTransactions: 1,
        personalBudgets: 1,
        accounts: 1,
        groceryItems: 1,
      }, "en")
    ).toBe(
      "1 transaction, 1 recurring rule, 1 budget, 1 account, and 1 grocery item"
    );
  });

  it("names accounts in Spanish", () => {
    expect(describeMemberData({ ...EMPTY, accounts: 2 }, "es")).toBe("2 cuentas");
  });

  it("reads naturally in Spanish", () => {
    expect(
      describeMemberData({ ...EMPTY, transactions: 12, personalBudgets: 1, groceryItems: 4 }, "es")
    ).toBe("12 movimientos, 1 presupuesto y 4 artículos de compras");
  });

  it("is empty when the member added nothing", () => {
    expect(describeMemberData(EMPTY, "en")).toBe("");
  });
});
