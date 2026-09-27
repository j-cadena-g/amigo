import { describe, expect, it } from "vitest";
import { CURRENCY_CODES } from "@amigo/db";
import {
  SUPPORTED_CURRENCIES,
  currencyFractionDigits,
  formatCents,
  formatCentsParts,
  formatShortCents,
  formatSignedCents,
} from "./currency";

describe("formatCentsParts", () => {
  it("splits CAD into symbol, grouped whole units, and cents", () => {
    expect(formatCentsParts(234056, "CAD")).toEqual({
      sign: "",
      symbol: "$",
      symbolPosition: "before",
      whole: "2,340",
      fraction: "56",
    });
  });

  it("keeps the symbol after the amount where the locale puts it there", () => {
    expect(formatCentsParts(234056, "EUR")).toEqual({
      sign: "",
      symbol: "€",
      symbolPosition: "after",
      whole: "2.340",
      fraction: "56",
    });
  });

  it("uses a true minus sign for negative amounts", () => {
    expect(formatCentsParts(-4599, "CAD")).toEqual({
      sign: "−",
      symbol: "$",
      symbolPosition: "before",
      whole: "45",
      fraction: "99",
    });
  });

  it("omits cents when the amount is shown without them", () => {
    expect(formatCentsParts(234056, "CAD", { compact: true })).toMatchObject({
      whole: "2,341",
      fraction: "",
    });
  });

  it("shows Colombian pesos whole, grouped with periods", () => {
    expect(formatCentsParts(4_500_000, "COP")).toEqual({
      sign: "",
      symbol: "$",
      symbolPosition: "before",
      whole: "45.000",
      fraction: "",
    });
  });

  it("keeps a zero amount readable", () => {
    expect(formatCentsParts(0, "GBP")).toEqual({
      sign: "",
      symbol: "£",
      symbolPosition: "before",
      whole: "0",
      fraction: "00",
    });
  });
});

describe("formatSignedCents", () => {
  it("prefixes negatives with U+2212 and leaves positives unsigned by default", () => {
    expect(formatSignedCents(-4599, "CAD")).toBe(`−${formatCents(4599, "CAD")}`);
    expect(formatSignedCents(4599, "CAD")).toBe(formatCents(4599, "CAD"));
  });

  it("adds a plus on positives when asked", () => {
    expect(formatSignedCents(285000, "CAD", { showPlus: true })).toBe(
      `+${formatCents(285000, "CAD")}`
    );
    expect(formatSignedCents(0, "CAD", { showPlus: true })).toBe(
      formatCents(0, "CAD")
    );
  });
});

describe("formatShortCents", () => {
  it("drops cents and abbreviates from a thousand up", () => {
    expect(formatShortCents(84_50, "CAD")).toBe("$85");
    expect(formatShortCents(1_250_00, "CAD")).toBe("$1.3K");
    expect(formatShortCents(-45_00, "USD")).toBe("−$45");
    expect(formatShortCents(999_60, "CAD")).toBe("$1K");
    expect(formatShortCents(2_500_000_00, "CAD")).toBe("$2.5M");
  });

  it("abbreviates thousands in locales whose compact notation doesn't", () => {
    expect(formatShortCents(1_250_00, "EUR")).toBe("1,3K\u00a0€");
    expect(formatShortCents(12_500_00, "EUR")).toBe("12,5K\u00a0€");
  });
});

describe("formatCents", () => {
  it("rounds pesos to whole units", () => {
    expect(formatCents(123_456_750, "COP")).toBe("$\u00a01.234.568");
  });
});

describe("currencyFractionDigits", () => {
  it("is 0 for pesos and 2 otherwise", () => {
    expect(currencyFractionDigits("COP")).toBe(0);
    expect(currencyFractionDigits("CAD")).toBe(2);
    expect(currencyFractionDigits(null)).toBe(2);
    expect(currencyFractionDigits("XYZ")).toBe(2);
  });
});

describe("SUPPORTED_CURRENCIES", () => {
  it("lists every currency the database accepts, in order", () => {
    expect(SUPPORTED_CURRENCIES.map((c) => c.code)).toEqual([...CURRENCY_CODES]);
  });
});
