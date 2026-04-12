import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRANSACTIONS_LIMIT,
  DEFAULT_TRANSACTIONS_PAGE,
  parseCalendarQuery,
  parseTransactionsListQuery,
} from "./request-validation";

describe("parseTransactionsListQuery", () => {
  it("clamps pagination values and rejects invalid type filters", () => {
    expect(() =>
      parseTransactionsListQuery({
        page: "0",
        limit: "999",
        type: "bogus",
      })
    ).toThrow('Invalid type filter');
  });

  it("falls back to defaults for unparsable values", () => {
    expect(
      parseTransactionsListQuery({
        page: "wat",
        limit: "",
      })
    ).toEqual({
      page: DEFAULT_TRANSACTIONS_PAGE,
      limit: DEFAULT_TRANSACTIONS_LIMIT,
      type: undefined,
    });
  });

  it("preserves valid pagination and type filters", () => {
    expect(
      parseTransactionsListQuery({
        page: "4",
        limit: "25",
        type: "expense",
      })
    ).toEqual({
      page: 4,
      limit: 25,
      type: "expense",
    });
  });
});

describe("parseCalendarQuery", () => {
  it("accepts bounded year and month values", () => {
    expect(parseCalendarQuery({ year: "2026", month: "4" })).toEqual({
      year: 2026,
      month: 4,
    });
  });

  it("rejects out-of-range months", () => {
    expect(() => parseCalendarQuery({ year: "2026", month: "13" })).toThrow();
  });
});
