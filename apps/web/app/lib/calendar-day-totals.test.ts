import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Calendar } from "../components/calendar";
import { formatCents } from "./currency";
import {
  formatDayTotal,
  transactionTotalsForDay,
  type TransactionTotalEvent,
} from "./calendar-day-totals";

function txn(
  amount: number,
  transactionType: "income" | "expense",
  currency = "CAD"
): TransactionTotalEvent {
  return {
    type: "transaction",
    metadata: { amount, currency, transactionType },
  };
}

describe("transactionTotalsForDay", () => {
  it("nets income against expenses in the same currency", () => {
    expect(
      transactionTotalsForDay([
        txn(15000, "income"),
        txn(4200, "expense"),
        txn(800, "expense"),
      ])
    ).toEqual([{ currency: "CAD", netCents: 10000 }]);
  });

  it("includes scheduled recurring amounts and ignores groceries", () => {
    expect(
      transactionTotalsForDay([
        { type: "grocery_purchase" },
        {
          type: "recurring",
          metadata: {
            amount: 5000,
            currency: "CAD",
            transactionType: "expense",
          },
        },
        txn(2500, "expense"),
      ])
    ).toEqual([{ currency: "CAD", netCents: -7500 }]);
  });

  it("keeps mixed currencies separate", () => {
    expect(
      transactionTotalsForDay([
        txn(1000, "expense", "USD"),
        txn(2000, "expense", "CAD"),
      ])
    ).toEqual([
      { currency: "CAD", netCents: -2000 },
      { currency: "USD", netCents: -1000 },
    ]);
  });

  it("defaults a missing currency to CAD and skips an unsupported one", () => {
    expect(
      transactionTotalsForDay([
        {
          type: "transaction",
          metadata: { amount: 1000, transactionType: "expense" },
        },
        txn(500, "expense", "JPY"),
      ])
    ).toEqual([{ currency: "CAD", netCents: -1000 }]);
  });

  it("returns nothing when a day has no transaction amounts", () => {
    expect(transactionTotalsForDay([])).toEqual([]);
    expect(
      transactionTotalsForDay([
        { type: "transaction", metadata: { transactionType: "expense" } },
      ])
    ).toEqual([]);
  });
});

describe("calendar day cells", () => {
  it("does not print amounts on the date", () => {
    const html = renderToStaticMarkup(
      React.createElement(Calendar, {
        compact: false,
        initialMonth: "2026-09",
        initialEvents: [
          {
            id: "t1",
            type: "transaction",
            date: "2026-09-12",
            title: "Coffee",
            color: "red",
            metadata: {
              amount: 450,
              currency: "CAD",
              transactionType: "expense",
            },
          },
          {
            id: "t2",
            type: "transaction",
            date: "2026-09-12",
            title: "Pay",
            color: "green",
            metadata: {
              amount: 2000,
              currency: "CAD",
              transactionType: "income",
            },
          },
        ],
      })
    );

    expect(html).not.toContain(formatDayTotal(1550, "CAD"));
    expect(html).not.toContain(formatCents(450, "CAD", { compact: true }));
    expect(html).not.toContain(formatCents(2000, "CAD", { compact: true }));
    expect(html).not.toContain("net ");
  });
});

describe("formatDayTotal", () => {
  it("prefixes a plus on a positive net and keeps the currency format otherwise", () => {
    expect(formatDayTotal(10000, "CAD")).toBe(`+${formatCents(10000, "CAD")}`);
    expect(formatDayTotal(-2500, "CAD")).toBe(formatCents(-2500, "CAD"));
    expect(formatDayTotal(0, "CAD", { compact: true })).toBe(
      formatCents(0, "CAD", { compact: true })
    );
  });
});
