import { describe, expect, it } from "vitest";
import { FORMAT_LOCALES } from "@amigo/db";
import {
  DEFAULT_LOCALE,
  FORMAT_LOCALE_OPTIONS,
  isFormatLocale,
  parseAcceptLanguage,
  resolveLocale,
} from "./locale";

describe("parseAcceptLanguage", () => {
  it("orders tags by quality, keeping header order for ties", () => {
    expect(parseAcceptLanguage("en-US,en;q=0.9,es-CO;q=0.95")).toEqual([
      "en-US",
      "es-CO",
      "en",
    ]);
    expect(parseAcceptLanguage("es-CO, es")).toEqual(["es-CO", "es"]);
  });

  it("drops wildcards, zero quality, and junk", () => {
    expect(parseAcceptLanguage("*, fr;q=0, de;q=abc")).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
});

describe("resolveLocale", () => {
  it("uses the saved choice first", () => {
    expect(
      resolveLocale({ preferred: "es-CO", homeCurrency: "CAD", acceptLanguage: "en-CA" })
    ).toBe("es-CO");
  });

  it("ignores a saved value outside the supported list", () => {
    expect(resolveLocale({ preferred: "xx-YY", homeCurrency: "CAD" })).toBe("en-CA");
  });

  it("follows the household's currency when the browser reads the same language", () => {
    expect(resolveLocale({ homeCurrency: "CAD", acceptLanguage: "en-US,en;q=0.9" })).toBe(
      "en-CA"
    );
    expect(resolveLocale({ homeCurrency: "COP", acceptLanguage: "es-MX" })).toBe("es-CO");
    expect(resolveLocale({ homeCurrency: "COP" })).toBe("es-CO");
  });

  it("switches to the browser's locale when it reads a different language", () => {
    expect(resolveLocale({ homeCurrency: "CAD", acceptLanguage: "es-CO,es;q=0.9" })).toBe(
      "es-CO"
    );
    expect(resolveLocale({ homeCurrency: "COP", acceptLanguage: "en-US" })).toBe("en-US");
  });

  it("maps the browser to a supported format in the same language", () => {
    expect(resolveLocale({ homeCurrency: "CAD", acceptLanguage: "es-AR" })).toBe("es-CO");
    expect(resolveLocale({ homeCurrency: "CAD", acceptLanguage: "fr-FR,fr;q=0.9" })).toBe(
      "fr-CA"
    );
    expect(resolveLocale({ homeCurrency: "COP", acceptLanguage: "de-AT" })).toBe("de-DE");
  });

  it("skips invalid tags and languages without a supported format", () => {
    expect(resolveLocale({ homeCurrency: "CAD", acceptLanguage: "zz-invalid-tag-!!, es" })).toBe(
      "es-CO"
    );
    expect(resolveLocale({ homeCurrency: "CAD", acceptLanguage: "ar-EG, ja" })).toBe("en-CA");
    expect(resolveLocale({ homeCurrency: "COP", acceptLanguage: "ar-EG, en-US" })).toBe(
      "en-US"
    );
  });

  it("defaults to en-CA when nothing is known", () => {
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({ acceptLanguage: "en-GB" })).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({ acceptLanguage: "es-CO" })).toBe("es-CO");
  });
});

describe("FORMAT_LOCALE_OPTIONS", () => {
  it("labels every locale the database accepts", () => {
    expect(FORMAT_LOCALE_OPTIONS.map((o) => o.value)).toEqual([...FORMAT_LOCALES]);
    for (const option of FORMAT_LOCALE_OPTIONS) expect(option.label).not.toBe("");
    expect(isFormatLocale("es-CO")).toBe(true);
    expect(isFormatLocale("es")).toBe(false);
  });
});
