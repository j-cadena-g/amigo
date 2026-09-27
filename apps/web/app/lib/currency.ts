import type { CurrencyCode, FormatLocale } from "@amigo/db";
import { CURRENCY_CODES, DEFAULT_HOME_CURRENCY } from "@amigo/db";

interface CurrencyConfig {
  name: string;
  /**
   * Formatting conventions a household using this currency most likely
   * expects; the default display locale until a user picks their own.
   */
  homeLocale: FormatLocale;
  /**
   * Decimal places shown. Storage is always integer cents; pesos are shown
   * whole because centavos aren't used day to day.
   */
  fractionDigits: 0 | 2;
}

const CURRENCY_CONFIG: Record<CurrencyCode, CurrencyConfig> = {
  CAD: { name: "Canadian dollar", homeLocale: "en-CA", fractionDigits: 2 },
  USD: { name: "US dollar", homeLocale: "en-US", fractionDigits: 2 },
  EUR: { name: "Euro", homeLocale: "de-DE", fractionDigits: 2 },
  GBP: { name: "British pound", homeLocale: "en-GB", fractionDigits: 2 },
  MXN: { name: "Mexican peso", homeLocale: "es-MX", fractionDigits: 2 },
  COP: { name: "Colombian peso", homeLocale: "es-CO", fractionDigits: 0 },
};

export const SUPPORTED_CURRENCIES: { code: CurrencyCode; name: string }[] =
  CURRENCY_CODES.map((code) => ({ code, name: CURRENCY_CONFIG[code].name }));

/** Decimal places a currency is shown with; unknown codes fall back to 2. */
export function currencyFractionDigits(currency: string | null | undefined): number {
  const config = CURRENCY_CONFIG[(currency ?? DEFAULT_HOME_CURRENCY) as CurrencyCode];
  return config?.fractionDigits ?? 2;
}

/** Display locale that fits a household's home currency, e.g. COP → "es-CO". */
export function currencyHomeLocale(currency: string | null | undefined): FormatLocale {
  const config = CURRENCY_CONFIG[(currency ?? DEFAULT_HOME_CURRENCY) as CurrencyCode];
  return (config ?? CURRENCY_CONFIG[DEFAULT_HOME_CURRENCY]).homeLocale;
}

/**
 * True when Intl can format `locale` itself. Malformed tags throw and
 * well-formed unknown ones ("zz-ZZ") would silently use the runtime's locale.
 */
function isSupportedLocale(locale: string): boolean {
  try {
    return Intl.NumberFormat.supportedLocalesOf(locale).length > 0;
  } catch {
    return false;
  }
}

/** Formatters are costly to build; the cap only matters if callers pass unusual locales. */
const FORMATTER_CACHE_LIMIT = 256;
const formatterCache = new Map<string, Intl.NumberFormat>();

/**
 * Cached currency formatter. `locale` is the viewer's (see `useLocale`), so a
 * Canadian sees "US$12.50" while a Colombian sees "US$ 12,50"; the currency
 * only decides the symbol and decimal places.
 */
function currencyFormatter(
  currency: CurrencyCode | null | undefined,
  locale: string,
  digits: { min: number; max: number },
  currencyDisplay: "symbol" | "narrowSymbol" = "symbol"
): Intl.NumberFormat {
  const safeCurrency: CurrencyCode = currency ?? DEFAULT_HOME_CURRENCY;
  const key = `${locale}|${safeCurrency}|${digits.min}|${digits.max}|${currencyDisplay}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    const options: Intl.NumberFormatOptions = {
      style: "currency",
      currency: safeCurrency,
      currencyDisplay,
      minimumFractionDigits: digits.min,
      maximumFractionDigits: digits.max,
    };
    formatter = new Intl.NumberFormat(
      isSupportedLocale(locale) ? locale : currencyHomeLocale(safeCurrency),
      options
    );
    if (formatterCache.size >= FORMATTER_CACHE_LIMIT) formatterCache.clear();
    formatterCache.set(key, formatter);
  }
  return formatter;
}

function displayDigits(
  currency: CurrencyCode | null | undefined,
  options?: { compact?: boolean }
): { min: number; max: number } {
  const digits = options?.compact ? 0 : currencyFractionDigits(currency);
  return { min: digits, max: digits };
}

/**
 * Format a monetary value in the specified currency.
 * Amounts from D1 are stored as integer cents — pass cents / 100 for display.
 */
export function formatCurrency(
  value: number,
  currency: CurrencyCode | null | undefined,
  locale: string,
  options?: { compact?: boolean }
): string {
  return currencyFormatter(currency, locale, displayDigits(currency, options)).format(value);
}

export interface CentsParts {
  sign: "" | "−";
  symbol: string;
  symbolPosition: "before" | "after";
  /** Whole units with the locale's grouping, e.g. "2,340". */
  whole: string;
  /** Minor units, e.g. "56"; empty when the amount is shown without them. */
  fraction: string;
}

/**
 * Split cents into the pieces a price tag sets separately: sign, currency
 * symbol, whole units, and cents. The decimal separator is dropped.
 */
export function formatCentsParts(
  cents: number,
  currency: CurrencyCode | null | undefined,
  locale: string,
  options?: { compact?: boolean }
): CentsParts {
  const parts = currencyFormatter(
    currency,
    locale,
    displayDigits(currency, options)
  ).formatToParts(Math.abs(cents) / 100);
  let symbol = "";
  let symbolPosition: CentsParts["symbolPosition"] = "before";
  let whole = "";
  let fraction = "";

  for (const part of parts) {
    if (part.type === "currency") {
      symbol = part.value;
      symbolPosition = whole === "" ? "before" : "after";
    } else if (part.type === "integer" || part.type === "group") {
      whole += part.value;
    } else if (part.type === "fraction") {
      fraction = part.value;
    }
  }

  return { sign: cents < 0 ? "−" : "", symbol, symbolPosition, whole, fraction };
}

/** Format cents with a U+2212 minus for negatives and an optional plus. */
export function formatSignedCents(
  cents: number,
  currency: CurrencyCode | null | undefined,
  locale: string,
  options?: { showPlus?: boolean; compact?: boolean }
): string {
  const formatted = formatCents(Math.abs(cents), currency, locale, options);
  if (cents < 0) return `−${formatted}`;
  if (cents > 0 && options?.showPlus) return `+${formatted}`;
  return formatted;
}

/**
 * Format cents as a display-friendly currency string.
 */
export function formatCents(
  cents: number,
  currency: CurrencyCode | null | undefined,
  locale: string,
  options?: { compact?: boolean }
): string {
  return formatCurrency(cents / 100, currency, locale, options);
}

/**
 * Whole units, abbreviated from 1,000 up ("$84", "$1.3K", "1,3K€"), for
 * figures that must fit a calendar cell. Scaled by hand because some locales
 * (de-DE) leave thousands unabbreviated in compact notation. Uses the narrow
 * symbol ("$", not "CAD") since cells only show the household's own currency,
 * and drops the space between symbol and number.
 */
export function formatShortCents(
  cents: number,
  currency: CurrencyCode | null | undefined,
  locale: string
): string {
  const units = Math.abs(cents) / 100;
  const [scale, suffix] =
    units >= 999_950 ? [1_000_000, "M"] : units >= 999.5 ? [1_000, "K"] : [1, ""];
  const parts = currencyFormatter(
    currency,
    locale,
    { min: 0, max: scale === 1 ? 0 : 1 },
    "narrowSymbol"
  ).formatToParts(units / scale);

  let formatted = "";
  let lastNumberIndex = -1;
  parts.forEach((part, i) => {
    if (part.type === "integer" || part.type === "fraction") lastNumberIndex = i;
  });
  parts.forEach((part, i) => {
    // Cells are tight: "$ 2,9K" loses its space so it fits like "$2.9K".
    if (part.type === "literal" && part.value.trim() === "") return;
    formatted += part.value;
    if (i === lastNumberIndex) formatted += suffix;
  });
  return cents < 0 ? `−${formatted}` : formatted;
}

/**
 * Calculate home currency amount from original cents and exchange rate.
 * Returns cents in home currency.
 */
export function calculateHomeCents(
  originalCents: number,
  exchangeRateToHome: number | null
): number {
  if (exchangeRateToHome === null) return originalCents;
  return Math.round(originalCents * exchangeRateToHome);
}
