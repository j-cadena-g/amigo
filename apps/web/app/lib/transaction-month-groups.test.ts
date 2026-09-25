import { describe, expect, it } from "vitest";
import {
  formatMonthHeading,
  groupTransactionsByMonth,
  monthKey,
  monthTotals,
  type MonthGroupTransaction,
} from "./transaction-month-groups";

function txn(
  id: string,
  date: string,
  amount: number,
  type: "income" | "expense" = "expense",
  currency = "CAD"
): MonthGroupTransaction & { id: string } {
  return { id, date, amount, type, currency };
}

const september = [
  txn("s1", "2026-09-23", 8412),
  txn("s2", "2026-09-20", 285000, "income"),
  txn("s3", "2026-09-02", 12050),
];
const august = [txn("a1", "2026-08-31", 4000), txn("a2", "2026-08-15", 285000, "income")];

describe("groupTransactionsByMonth", () => {
  it("groups a newest-first list under month headings in order", () => {
    const groups = groupTransactionsByMonth([...september, ...august], {
      homeCurrency: "CAD",
      hasMore: false,
    });

    expect(groups.map((g) => [g.month, g.label])).toEqual([
      ["2026-09", "September 2026"],
      ["2026-08", "August 2026"],
    ]);
    expect(groups[0]!.transactions.map((t) => t.id)).toEqual(["s1", "s2", "s3"]);
    expect(groups[1]!.transactions.map((t) => t.id)).toEqual(["a1", "a2"]);
  });

  it("totals money out and in for every month once the list is complete", () => {
    const groups = groupTransactionsByMonth([...september, ...august], {
      homeCurrency: "CAD",
      hasMore: false,
    });

    expect(groups.map((g) => g.totals)).toEqual([
      { outCents: 20462, inCents: 285000, hasOtherCurrencies: false },
      { outCents: 4000, inCents: 285000, hasOtherCurrencies: false },
    ]);
  });

  it("leaves the oldest month without totals while more pages can load", () => {
    const groups = groupTransactionsByMonth([...september, ...august], {
      homeCurrency: "CAD",
      hasMore: true,
    });

    expect(groups[0]!.totals).not.toBeNull();
    expect(groups[1]!.totals).toBeNull();
  });

  it("gives a lone month no totals while more pages can load", () => {
    const groups = groupTransactionsByMonth(september, {
      homeCurrency: "CAD",
      hasMore: true,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.totals).toBeNull();
  });

  it("reads the month from timestamp-shaped dates", () => {
    const groups = groupTransactionsByMonth(
      [txn("t1", "2026-10-01T00:00:00.000Z", 500), txn("t2", "2026-09-30T23:00:00Z", 700)],
      { homeCurrency: "CAD", hasMore: false }
    );

    expect(groups.map((g) => g.month)).toEqual(["2026-10", "2026-09"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupTransactionsByMonth([], { homeCurrency: "CAD", hasMore: true })).toEqual([]);
  });
});

describe("monthTotals", () => {
  it("counts only home-currency rows and flags the rest", () => {
    expect(
      monthTotals(
        [
          txn("c1", "2026-09-05", 2500),
          txn("u1", "2026-09-06", 9900, "expense", "USD"),
          txn("e1", "2026-09-07", 10000, "income", "EUR"),
          txn("c2", "2026-09-08", 150000, "income"),
        ],
        "CAD"
      )
    ).toEqual({ outCents: 2500, inCents: 150000, hasOtherCurrencies: true });
  });

  it("totals against the household currency, whatever it is", () => {
    expect(
      monthTotals([txn("u1", "2026-09-06", 9900, "expense", "USD"), txn("c1", "2026-09-05", 2500)], "USD")
    ).toEqual({ outCents: 9900, inCents: 0, hasOtherCurrencies: true });
  });
});

describe("month labels", () => {
  it("keys and names calendar months", () => {
    expect(monthKey("2026-01-31")).toBe("2026-01");
    expect(formatMonthHeading("2026-01")).toBe("January 2026");
    expect(formatMonthHeading("2025-12")).toBe("December 2025");
  });
});
