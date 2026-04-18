import { describe, expect, it } from "vitest";
import { ActionError } from "./errors";
import {
  DEFAULT_TRANSACTIONS_LIMIT,
  DEFAULT_TRANSACTIONS_PAGE,
  MAX_TRANSACTIONS_LIMIT,
  parseCalendarQuery,
  parseTransactionsListQuery,
} from "./request-validation";

describe("parseTransactionsListQuery", () => {
  it("rejects invalid type filters", () => {
    try {
      parseTransactionsListQuery({
        page: "0",
        limit: "999",
        type: "bogus",
      });
      throw new Error("Expected parseTransactionsListQuery to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ActionError);
      expect(error).toMatchObject({
        message: 'Invalid type filter; expected "income" or "expense".',
        code: "VALIDATION_ERROR",
      } satisfies Partial<ActionError>);
    }
  });

  it("clamps out-of-range pagination values", () => {
    expect(
      parseTransactionsListQuery({
        page: "0",
        limit: "999",
      })
    ).toEqual({
      page: 1,
      limit: MAX_TRANSACTIONS_LIMIT,
      type: undefined,
    });
  });

  it("clamps negative and oversized pagination safely", () => {
    expect(
      parseTransactionsListQuery({
        page: "-5",
        limit: `${Number.MAX_SAFE_INTEGER + 1}`,
      })
    ).toEqual({
      page: DEFAULT_TRANSACTIONS_PAGE,
      limit: MAX_TRANSACTIONS_LIMIT,
      type: undefined,
    });
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

  it("falls back to defaults for malformed numeric strings", () => {
    expect(
      parseTransactionsListQuery({
        page: "12abc",
        limit: "25.5",
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

  it("preserves valid pagination and an income type filter", () => {
    expect(
      parseTransactionsListQuery({
        page: "4",
        limit: "25",
        type: "income",
      })
    ).toEqual({
      page: 4,
      limit: 25,
      type: "income",
    });
  });

  it("treats an empty type query as absent", () => {
    expect(
      parseTransactionsListQuery({
        page: "2",
        limit: "10",
        type: "",
      })
    ).toEqual({
      page: 2,
      limit: 10,
      type: undefined,
    });
  });

  it("accepts minimum and maximum supported pagination boundaries", () => {
    expect(
      parseTransactionsListQuery({
        page: "1",
        limit: "1",
      })
    ).toEqual({
      page: 1,
      limit: 1,
      type: undefined,
    });

    expect(
      parseTransactionsListQuery({
        page: "4",
        limit: `${MAX_TRANSACTIONS_LIMIT}`,
      })
    ).toEqual({
      page: 4,
      limit: MAX_TRANSACTIONS_LIMIT,
      type: undefined,
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

  it("accepts boundary month values", () => {
    expect(parseCalendarQuery({ year: "2026", month: "1" })).toEqual({
      year: 2026,
      month: 1,
    });
    expect(parseCalendarQuery({ year: "2026", month: "12" })).toEqual({
      year: 2026,
      month: 12,
    });
  });

  it("rejects out-of-range months", () => {
    try {
      parseCalendarQuery({ year: "2026", month: "13" });
      throw new Error("Expected parseCalendarQuery to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ActionError);
      expect(error).toMatchObject({
        message: "Valid year and month are required",
        code: "VALIDATION_ERROR",
      } satisfies Partial<ActionError>);
    }
  });

  it("rejects non-numeric or missing calendar params", () => {
    for (const query of [
      { year: "abc", month: "4" },
      { year: "2026", month: "0" },
      { year: "2019", month: "4" },
      { year: "2101", month: "4" },
      {},
      { year: "2026" },
    ]) {
      expect(() => parseCalendarQuery(query)).toThrowError(
        expect.objectContaining({
          message: "Valid year and month are required",
          code: "VALIDATION_ERROR",
        }) satisfies Partial<ActionError>
      );
    }
  });
});
