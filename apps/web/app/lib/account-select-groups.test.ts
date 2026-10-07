import { describe, expect, it } from "vitest";
import { EXPENSE_ACCOUNT_GROUPS, groupAccountsForSelect } from "./account-select-groups";

const account = (id: string, type: string) => ({ id, type });

describe("groupAccountsForSelect", () => {
  it("orders groups cash and bank, cards, loans, then investments and property", () => {
    const groups = groupAccountsForSelect([
      account("prop", "PROPERTY"),
      account("loan", "LOAN"),
      account("card", "CREDIT"),
      account("save", "SAVINGS"),
      account("inv", "INVESTMENT"),
      account("check", "CHECKING"),
      account("cash", "CASH"),
      account("other", "OTHER"),
    ]);
    expect(groups.map((g) => g.key)).toEqual([
      "cashAndBank",
      "creditCards",
      "loans",
      "investmentsAndProperty",
    ]);
    expect(groups[0]?.accounts.map((a) => a.id)).toEqual(["save", "check", "cash", "other"]);
    expect(groups[3]?.accounts.map((a) => a.id)).toEqual(["prop", "inv"]);
  });

  it("leaves out empty groups", () => {
    expect(groupAccountsForSelect([account("card", "CREDIT")]).map((g) => g.key)).toEqual([
      "creditCards",
    ]);
    expect(groupAccountsForSelect([])).toEqual([]);
  });

  it("limits expense accounts to cash and bank and credit cards", () => {
    const accounts = [
      account("loan", "LOAN"),
      account("card", "CREDIT"),
      account("inv", "INVESTMENT"),
      account("check", "CHECKING"),
    ];
    expect(
      groupAccountsForSelect(accounts, EXPENSE_ACCOUNT_GROUPS).map((g) => [g.key, g.accounts.map((a) => a.id)])
    ).toEqual([
      ["cashAndBank", ["check"]],
      ["creditCards", ["card"]],
    ]);
  });

  it("keeps an already linked account outside the allowed groups", () => {
    const groups = groupAccountsForSelect(
      [account("loan", "LOAN"), account("other-loan", "LOAN"), account("check", "CHECKING")],
      EXPENSE_ACCOUNT_GROUPS,
      "loan"
    );
    expect(groups.map((g) => [g.key, g.accounts.map((a) => a.id)])).toEqual([
      ["cashAndBank", ["check"]],
      ["loans", ["loan"]],
    ]);
  });
});
