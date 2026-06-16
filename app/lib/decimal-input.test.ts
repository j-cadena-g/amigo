import { describe, expect, it } from "vitest";
import { isPositiveDecimal, sanitizeDecimalInput } from "./decimal-input";

describe("sanitizeDecimalInput", () => {
  it("strips non-numeric characters including scientific notation letters", () => {
    expect(sanitizeDecimalInput("1e2")).toBe("12");
    expect(sanitizeDecimalInput("12.34abc")).toBe("12.34");
    expect(sanitizeDecimalInput("-5.50")).toBe("5.50");
  });

  it("keeps a single decimal separator and limits fractional digits", () => {
    expect(sanitizeDecimalInput("12..3")).toBe("12.3");
    expect(sanitizeDecimalInput("12.345")).toBe("12.34");
    expect(sanitizeDecimalInput("12.")).toBe("12.");
  });
});

describe("isPositiveDecimal", () => {
  it("accepts only values greater than zero", () => {
    expect(isPositiveDecimal("0.01")).toBe(true);
    expect(isPositiveDecimal("12.50")).toBe(true);
    expect(isPositiveDecimal("0")).toBe(false);
    expect(isPositiveDecimal("-1")).toBe(false);
    expect(isPositiveDecimal("")).toBe(false);
  });
});
