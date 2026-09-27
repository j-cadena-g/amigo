import type { CurrencyCode } from "@amigo/db";
import { currencyFractionDigits, formatCents } from "@/app/lib/currency";
import { messagesFor, type Messages } from "@/app/i18n";
import { DEFAULT_LOCALE } from "@/app/lib/locale";

const GROUPED_WHOLE: Record<"." | ",", RegExp> = {
  ".": /^\d{1,3}(?:\.\d{3})+$/,
  ",": /^\d{1,3}(?:,\d{3})+$/,
};

/** Drop a thousands separator from whole units; null when the grouping is malformed. */
function ungroup(whole: string, group: "." | ","): string | null {
  if (!whole.includes(group)) return whole;
  return GROUPED_WHOLE[group].test(whole) ? whole.split(group).join("") : null;
}

/**
 * Parse a typed amount into major units (dollars, pesos), or null if it isn't one.
 *
 * Accepts both "1,234.56" and "1.234,56" without knowing the user's locale.
 * When only one kind of separator appears, it is a thousands separator if it
 * repeats or is followed by exactly three digits ("45.000" is forty-five
 * thousand); otherwise it is the decimal point ("45,5"). No supported currency
 * has three decimal places, so the three-digit case is never a fraction.
 */
export function parseAmount(raw: string): number | null {
  let value = raw.replace(/[\s\u00a0\u202f]/g, "");
  const negative = /^[-−]/.test(value);
  if (negative) value = value.slice(1);
  if (!/^[\d.,]*\d[\d.,]*$/.test(value)) return null;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  let whole: string | null = value;
  let fraction = "";

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalAt = Math.max(lastComma, lastDot);
    const group = lastComma > lastDot ? "." : ",";
    whole = ungroup(value.slice(0, decimalAt), group);
    fraction = value.slice(decimalAt + 1);
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sep = lastComma !== -1 ? "," : ".";
    const parts = value.split(sep);
    const [head = "", tail = ""] = parts;
    const isGrouping =
      parts.length > 2 || (tail.length === 3 && /[1-9]/.test(head));
    if (isGrouping) {
      whole = ungroup(value, sep);
    } else {
      whole = head;
      fraction = tail;
    }
  }

  if (whole === null || !/^\d*$/.test(whole) || !/^\d{0,2}$/.test(fraction)) {
    return null;
  }
  const amount = Number(`${whole || "0"}.${fraction || "0"}`);
  return negative && amount !== 0 ? -amount : amount;
}

export function isPositiveAmount(raw: string): boolean {
  const amount = parseAmount(raw);
  return amount !== null && amount > 0;
}

/**
 * Validity message for an amount field ("" when valid). An empty field is
 * left to the native `required` attribute.
 */
export function amountValidationMessage(
  raw: string,
  options: {
    allowNegative?: boolean;
    positive?: boolean;
    max?: number;
    currency?: CurrencyCode;
    locale?: string;
    /** Copy in the viewer's language; English when omitted. */
    messages?: Messages["common"];
  } = {}
): string {
  if (raw.trim() === "") return "";
  const locale = options.locale ?? DEFAULT_LOCALE;
  const m = options.messages ?? messagesFor("en").common;
  const amount = parseAmount(raw);
  if (amount === null) return m.amountInvalid(exampleAmount(locale));
  if (options.positive && amount <= 0) return m.amountPositive;
  if (!options.allowNegative && amount < 0) return m.amountNonNegative;
  if (options.max !== undefined && amount > options.max) {
    return m.amountMax(formatCents(Math.round(options.max * 100), options.currency, locale));
  }
  return "";
}

/** "," for locales that write 1,5 and "." otherwise; `parseAmount` reads either. */
export function decimalSeparator(locale: string): "." | "," {
  try {
    const part = new Intl.NumberFormat(locale)
      .formatToParts(1.5)
      .find((p) => p.type === "decimal");
    return part?.value === "," ? "," : ".";
  } catch {
    return ".";
  }
}

/** "1,250.50" or "1.250,50": an amount written the viewer's way, for hints. */
function exampleAmount(locale: string): string {
  return decimalSeparator(locale) === "," ? "1.250,50" : "1,250.50";
}

/** Placeholder for an empty amount field, e.g. "0.00", "0,00", or "0" for pesos. */
export function amountPlaceholder(
  currency: string | null | undefined,
  locale: string
): string {
  return currencyFractionDigits(currency) === 0 ? "0" : `0${decimalSeparator(locale)}00`;
}

/**
 * Format integer cents for a money input, ungrouped with the viewer's decimal
 * separator: "10.50" or "10,50", or "45000" for a currency shown without
 * decimals when there are no leftover cents.
 */
export function centsToInputString(
  cents: number,
  currency: string | null | undefined,
  locale: string
): string {
  if (currencyFractionDigits(currency) === 0 && cents % 100 === 0) {
    return String(cents / 100);
  }
  return (cents / 100).toFixed(2).replace(".", decimalSeparator(locale));
}
