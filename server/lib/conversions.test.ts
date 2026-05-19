import { describe, expect, it } from "vitest";
import { toCents } from "./conversions";

/**
 * Recurring create/update sends dollar amounts to the API; the handler
 * stores toCents(validated.amount). This documents the contract so client
 * code must not send pre-multiplied cents.
 */
describe("toCents (recurring / transaction API contract)", () => {
  it("converts 12.34 dollars to 1234 cents exactly once", () => {
    expect(toCents(12.34)).toBe(1234);
  });

  it("converts whole dollars", () => {
    expect(toCents(100)).toBe(10000);
  });

  it("rounds half-up for typical currency inputs", () => {
    expect(toCents(0.015)).toBe(2);
    expect(toCents(0.014)).toBe(1);
  });
});
