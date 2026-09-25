import type { CurrencyCode } from "@amigo/db";
import { DEFAULT_HOME_CURRENCY } from "@amigo/db";

const CURRENCY_CONFIG: Record<CurrencyCode, { locale: string; symbol: string }> =
  {
    CAD: { locale: "en-CA", symbol: "CA$" },
    USD: { locale: "en-US", symbol: "$" },
    EUR: { locale: "de-DE", symbol: "€" },
    GBP: { locale: "en-GB", symbol: "£" },
    MXN: { locale: "es-MX", symbol: "MX$" },
  };

export const SUPPORTED_CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "CAD", label: "Canadian Dollar (CAD)" },
  { code: "USD", label: "US Dollar (USD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "GBP", label: "British Pound (GBP)" },
  { code: "MXN", label: "Mexican Peso (MXN)" },
];

function currencyFormatter(
  currency: CurrencyCode | null | undefined,
  options?: { compact?: boolean }
): Intl.NumberFormat {
  const safeCurrency: CurrencyCode = currency ?? DEFAULT_HOME_CURRENCY;
  const config = CURRENCY_CONFIG[safeCurrency];

  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: safeCurrency,
    minimumFractionDigits: options?.compact ? 0 : 2,
    maximumFractionDigits: options?.compact ? 0 : 2,
  });
}

/**
 * Format a monetary value in the specified currency.
 * Amounts from D1 are stored as integer cents — pass cents / 100 for display.
 */
export function formatCurrency(
  value: number,
  currency: CurrencyCode | null | undefined,
  options?: { compact?: boolean }
): string {
  return currencyFormatter(currency, options).format(value);
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
  options?: { compact?: boolean }
): CentsParts {
  const parts = currencyFormatter(currency, options).formatToParts(
    Math.abs(cents) / 100
  );
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
  options?: { showPlus?: boolean; compact?: boolean }
): string {
  const formatted = formatCents(Math.abs(cents), currency, options);
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
  options?: { compact?: boolean }
): string {
  return formatCurrency(cents / 100, currency, options);
}

/**
 * Format with original and converted amounts.
 */
export function formatWithConversion(
  originalCents: number,
  originalCurrency: CurrencyCode,
  homeCents: number,
  homeCurrency: CurrencyCode
): { original: string; converted: string | null } {
  const original = formatCents(originalCents, originalCurrency);

  if (originalCurrency === homeCurrency) {
    return { original, converted: null };
  }

  return {
    original,
    converted: formatCents(homeCents, homeCurrency),
  };
}

/**
 * Get currency symbol only.
 */
export function getCurrencySymbol(
  currency: CurrencyCode | null | undefined
): string {
  const safeCurrency: CurrencyCode = currency ?? DEFAULT_HOME_CURRENCY;
  return CURRENCY_CONFIG[safeCurrency].symbol;
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
