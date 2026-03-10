import type { CurrencyCode } from "@amigo/db";

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

/**
 * Format a monetary value in the specified currency.
 * Amounts from D1 are stored as integer cents — pass cents / 100 for display.
 */
export function formatCurrency(
  value: number,
  currency: CurrencyCode | null | undefined,
  options?: { compact?: boolean }
): string {
  const safeCurrency: CurrencyCode = currency ?? "CAD";
  const config = CURRENCY_CONFIG[safeCurrency];

  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: safeCurrency,
    minimumFractionDigits: options?.compact ? 0 : 2,
    maximumFractionDigits: options?.compact ? 0 : 2,
  }).format(value);
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
  const safeCurrency: CurrencyCode = currency ?? "CAD";
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
