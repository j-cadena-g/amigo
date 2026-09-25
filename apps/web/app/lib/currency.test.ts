import { describe, expect, it } from "vitest";
import { formatCents, formatCentsParts, formatSignedCents } from "./currency";

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
