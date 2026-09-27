import { describe, expect, it } from "vitest";
import {
  amountValidationMessage,
  centsToInputString,
  filterAmountTyping,
  isPositiveAmount,
  parseAmount,
} from "./decimal-input";

describe("parseAmount", () => {
  it("reads plain numbers", () => {
    expect(parseAmount("12")).toBe(12);
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount(" 0.01 ")).toBe(0.01);
    expect(parseAmount(".5")).toBe(0.5);
    expect(parseAmount("12.")).toBe(12);
  });

  it("treats a comma followed by one or two digits as the decimal point", () => {
    expect(parseAmount("1,25")).toBe(1.25);
    expect(parseAmount("45,5")).toBe(45.5);
  });

  it("treats a lone separator before exactly three digits as thousands", () => {
    expect(parseAmount("45.000")).toBe(45000);
    expect(parseAmount("45,000")).toBe(45000);
    expect(parseAmount("1.250")).toBe(1250);
  });

  it("treats repeated separators as thousands", () => {
    expect(parseAmount("1.234.567")).toBe(1234567);
    expect(parseAmount("1,234,567")).toBe(1234567);
  });

  it("uses the last separator as the decimal point when both appear", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("2.500.000,5")).toBe(2500000.5);
  });

  it("ignores spaces used as thousands separators", () => {
    expect(parseAmount("1 234,56")).toBe(1234.56);
    expect(parseAmount("45\u00a0000")).toBe(45000);
  });

  it("keeps a leading minus", () => {
    expect(parseAmount("-1.250,75")).toBe(-1250.75);
    expect(parseAmount("−45")).toBe(-45);
    expect(Object.is(parseAmount("-0"), 0)).toBe(true);
  });

  it("rejects anything that is not an amount", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(".")).toBeNull();
    expect(parseAmount("1e2")).toBeNull();
    expect(parseAmount("12abc")).toBeNull();
    expect(parseAmount("12.345.6")).toBeNull();
    expect(parseAmount("1,2345")).toBeNull();
    expect(parseAmount("0.125")).toBeNull();
    expect(parseAmount("1,234.567")).toBeNull();
    expect(parseAmount("1.23,45")).toBeNull();
    expect(parseAmount("--5")).toBeNull();
  });
});

describe("filterAmountTyping", () => {
  it("keeps digits and both separators", () => {
    expect(filterAmountTyping("$ 45.000,50 COP")).toBe("45.000,50");
    expect(filterAmountTyping("1e2")).toBe("12");
  });

  it("keeps a leading minus only when negatives are allowed", () => {
    expect(filterAmountTyping("-5.50")).toBe("5.50");
    expect(filterAmountTyping("-5.50", { allowNegative: true })).toBe("-5.50");
    expect(filterAmountTyping("5-0", { allowNegative: true })).toBe("50");
  });
});

describe("isPositiveAmount", () => {
  it("accepts only amounts above zero", () => {
    expect(isPositiveAmount("0.01")).toBe(true);
    expect(isPositiveAmount("45.000")).toBe(true);
    expect(isPositiveAmount("0")).toBe(false);
    expect(isPositiveAmount("-1")).toBe(false);
    expect(isPositiveAmount("")).toBe(false);
    expect(isPositiveAmount("1abc")).toBe(false);
  });
});

describe("amountValidationMessage", () => {
  it("leaves empty fields to the required attribute", () => {
    expect(amountValidationMessage("", { positive: true })).toBe("");
  });

  it("flags unreadable, non-positive, negative, and too-large amounts", () => {
    expect(amountValidationMessage("12.345.6")).not.toBe("");
    expect(amountValidationMessage("0", { positive: true })).toBe(
      "Enter an amount greater than 0."
    );
    expect(amountValidationMessage("-5")).toBe("Enter 0 or more.");
    expect(amountValidationMessage("-5", { allowNegative: true })).toBe("");
    expect(amountValidationMessage("600", { max: 500, currency: "CAD" })).toMatch(
      /^Enter no more than .*500\.00\.$/
    );
    expect(amountValidationMessage("500", { max: 500 })).toBe("");
  });
});

describe("centsToInputString", () => {
  it("formats integer cents with two decimal places", () => {
    expect(centsToInputString(1050)).toBe("10.50");
    expect(centsToInputString(0)).toBe("0.00");
    expect(centsToInputString(5)).toBe("0.05");
    expect(centsToInputString(123456, "CAD")).toBe("1234.56");
    expect(centsToInputString(-1050, "CAD")).toBe("-10.50");
  });

  it("drops the decimals for whole amounts in currencies shown without them", () => {
    expect(centsToInputString(4_500_000, "COP")).toBe("45000");
    expect(centsToInputString(4_500_050, "COP")).toBe("45000.50");
  });

  it("round-trips through parseAmount", () => {
    for (const [cents, currency] of [
      [123456, "CAD"],
      [4_500_000, "COP"],
      [100_000, "COP"],
      [-99, "USD"],
    ] as const) {
      expect(Math.round(parseAmount(centsToInputString(cents, currency))! * 100)).toBe(
        cents
      );
    }
  });
});
