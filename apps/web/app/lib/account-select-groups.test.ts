import { describe, expect, it } from "vitest";
import { groupAccountsForSelect } from "./account-select-groups";

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
});
