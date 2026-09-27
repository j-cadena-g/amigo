import { describe, expect, it } from "vitest";
import { CURRENCY_CODES } from "@amigo/db";
import {
  SUPPORTED_CURRENCIES,
  currencyFractionDigits,
  currencyHomeLocale,
  formatCents,
  formatCentsParts,
  formatShortCents,
  formatSignedCents,
} from "./currency";

describe("formatCentsParts", () => {
  it("splits CAD into symbol, grouped whole units, and cents", () => {
    expect(formatCentsParts(234056, "CAD", "en-CA")).toEqual({
      sign: "",
      symbol: "$",
      symbolPosition: "before",
      whole: "2,340",
      fraction: "56",
    });
  });

  it("keeps the symbol after the amount where the locale puts it there", () => {
    expect(formatCentsParts(234056, "EUR", "de-DE")).toEqual({
      sign: "",
      symbol: "€",
      symbolPosition: "after",
      whole: "2.340",
      fraction: "56",
    });
  });

  it("uses a true minus sign for negative amounts", () => {
    expect(formatCentsParts(-4599, "CAD", "en-CA")).toEqual({
      sign: "−",
      symbol: "$",
      symbolPosition: "before",
      whole: "45",
      fraction: "99",
    });
  });

  it("omits cents when the amount is shown without them", () => {
    expect(formatCentsParts(234056, "CAD", "en-CA", { compact: true })).toMatchObject({
      whole: "2,341",
      fraction: "",
    });
  });

  it("shows Colombian pesos whole, grouped with periods", () => {
    expect(formatCentsParts(4_500_000, "COP", "es-CO")).toEqual({
      sign: "",
      symbol: "$",
      symbolPosition: "before",
      whole: "45.000",
      fraction: "",
    });
  });

  it("keeps a zero amount readable", () => {
    expect(formatCentsParts(0, "GBP", "en-GB")).toEqual({
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
    expect(formatSignedCents(-4599, "CAD", "en-CA")).toBe(
      `−${formatCents(4599, "CAD", "en-CA")}`
    );
    expect(formatSignedCents(4599, "CAD", "en-CA")).toBe(formatCents(4599, "CAD", "en-CA"));
  });

  it("adds a plus on positives when asked", () => {
    expect(formatSignedCents(285000, "CAD", "en-CA", { showPlus: true })).toBe(
      `+${formatCents(285000, "CAD", "en-CA")}`
    );
    expect(formatSignedCents(0, "CAD", "en-CA", { showPlus: true })).toBe(
      formatCents(0, "CAD", "en-CA")
    );
  });
});

describe("formatShortCents", () => {
  it("drops cents and abbreviates from a thousand up", () => {
    expect(formatShortCents(84_50, "CAD", "en-CA")).toBe("$85");
    expect(formatShortCents(1_250_00, "CAD", "en-CA")).toBe("$1.3K");
    expect(formatShortCents(-45_00, "USD", "en-US")).toBe("−$45");
    expect(formatShortCents(999_60, "CAD", "en-CA")).toBe("$1K");
    expect(formatShortCents(2_500_000_00, "CAD", "en-CA")).toBe("$2.5M");
  });

  it("abbreviates thousands in locales whose compact notation doesn't", () => {
    expect(formatShortCents(1_250_00, "EUR", "de-DE")).toBe("1,3K€");
    expect(formatShortCents(12_500_00, "EUR", "de-DE")).toBe("12,5K€");
  });

  it("keeps a narrow symbol when the viewer's locale would spell out the code", () => {
    expect(formatCents(8450, "CAD", "es-CO")).toBe("CAD\u00a084,50");
    expect(formatShortCents(84_50, "CAD", "es-CO")).toBe("$85");
    expect(formatShortCents(1_250_00, "CAD", "es-CO")).toBe("$1,3K");
  });
});

describe("formatCents", () => {
  it("rounds pesos to whole units", () => {
    expect(formatCents(123_456_750, "COP", "es-CO")).toBe("$\u00a01.234.568");
  });

  it("follows the viewer's locale, with the currency deciding symbol and decimals", () => {
    expect(formatCents(1250, "USD", "en-CA")).toBe("US$12.50");
    expect(formatCents(1250, "USD", "es-CO")).toBe("US$\u00a012,50");
    expect(formatCents(123456, "CAD", "es-CO")).toBe("CAD\u00a01.234,56");
    expect(formatCents(4_500_000, "COP", "en-CA")).toBe("COP\u00a045,000");
    expect(formatCents(1250, "CAD", "en-US")).toBe("CA$12.50");
  });

  it("falls back to the currency's home locale for an unusable tag", () => {
    expect(formatCents(123456, "CAD", "not a locale")).toBe("$1,234.56");
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

describe("currencyHomeLocale", () => {
  it("maps a household's currency to the conventions it most likely uses", () => {
    expect(currencyHomeLocale("CAD")).toBe("en-CA");
    expect(currencyHomeLocale("COP")).toBe("es-CO");
    expect(currencyHomeLocale("XYZ")).toBe("en-CA");
    expect(currencyHomeLocale(null)).toBe("en-CA");
  });
});
