import { describe, expect, it } from "vitest";
import {
  isPositiveDecimal,
  normalizeDecimalSeparators,
  parseDecimalInput,
  sanitizeDecimalInput,
} from "./decimal-input";

describe("normalizeDecimalSeparators", () => {
  it("treats comma as decimal when followed by one or two digits", () => {
    expect(normalizeDecimalSeparators("1,25")).toBe("1.25");
    expect(normalizeDecimalSeparators("1,2")).toBe("1.2");
  });

  it("treats comma as thousands when followed by three or more digits", () => {
    expect(normalizeDecimalSeparators("1,250")).toBe("1250");
    expect(normalizeDecimalSeparators("1,234,567")).toBe("1234567");
  });

  it("handles mixed separators", () => {
    expect(normalizeDecimalSeparators("1.234,56")).toBe("1234.56");
    expect(normalizeDecimalSeparators("1,234.56")).toBe("1234.56");
  });
});

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

describe("parseDecimalInput", () => {
  it("normalizes locale decimals before sanitizing", () => {
    expect(parseDecimalInput("1,25")).toBe("1.25");
    expect(parseDecimalInput("1.234,56")).toBe("1234.56");
  });
});

describe("isPositiveDecimal", () => {
  it("accepts only plain positive decimal strings", () => {
    expect(isPositiveDecimal("0.01")).toBe(true);
    expect(isPositiveDecimal("12.50")).toBe(true);
    expect(isPositiveDecimal("12")).toBe(true);
    expect(isPositiveDecimal("0")).toBe(false);
    expect(isPositiveDecimal("-1")).toBe(false);
    expect(isPositiveDecimal("")).toBe(false);
    expect(isPositiveDecimal("1e2")).toBe(false);
    expect(isPositiveDecimal("1abc")).toBe(false);
  });
});
