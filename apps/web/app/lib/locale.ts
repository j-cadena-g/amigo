import { FORMAT_LOCALES, UI_LANGUAGES, type FormatLocale, type UiLanguage } from "@amigo/db";
import { currencyHomeLocale } from "@/app/lib/currency";

/** Used when nothing else is known, matching the app's CAD default. */
export const DEFAULT_LOCALE: FormatLocale = "en-CA";

const FORMAT_LOCALE_LABELS: Record<FormatLocale, string> = {
  "en-CA": "English (Canada)",
  "en-US": "English (United States)",
  "en-GB": "English (United Kingdom)",
  "fr-CA": "Français (Canada)",
  "es-CO": "Español (Colombia)",
  "es-MX": "Español (México)",
  "es-ES": "Español (España)",
  "de-DE": "Deutsch (Deutschland)",
};

/**
 * Formats a user can pick in Settings. Labels are in their own language so a
 * reader finds theirs without knowing English.
 */
export const FORMAT_LOCALE_OPTIONS = FORMAT_LOCALES.map((value) => ({
  value,
  label: FORMAT_LOCALE_LABELS[value],
}));

export function formatLocaleLabel(locale: FormatLocale): string {
  return FORMAT_LOCALE_LABELS[locale];
}

export function isFormatLocale(value: unknown): value is FormatLocale {
  return (FORMAT_LOCALES as readonly unknown[]).includes(value);
}

/** Language tags from an Accept-Language header, most preferred first. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag !== "" && entry.tag !== "*" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.tag);
}

function languageOf(locale: string): string {
  try {
    return new Intl.Locale(locale).language;
  } catch {
    return locale.split("-")[0]!.toLowerCase();
  }
}

/**
 * The supported format for a browser tag: the exact locale, else the first
 * option in the same language ("es-AR" → "es-CO", "fr" → "fr-CA"). Other
 * languages get null, so formatting never uses digits or separators that
 * amount fields can't read (Arabic-Indic digits, "٫").
 */
function matchFormatLocale(tag: string): FormatLocale | null {
  let canonical: string;
  try {
    canonical = Intl.getCanonicalLocales(tag)[0] ?? "";
  } catch {
    return null;
  }
  if (isFormatLocale(canonical)) return canonical;
  const language = languageOf(canonical);
  return FORMAT_LOCALES.find((locale) => languageOf(locale) === language) ?? null;
}

/**
 * Pick the locale for formatting numbers and dates, always one of
 * `FORMAT_LOCALES`:
 *
 * 1. The user's saved choice.
 * 2. The household's conventions (from its home currency), so an English
 *    browser in a Canadian household keeps "$1,234.56".
 * 3. The viewer's language instead, when it differs from the household's,
 *    so a Spanish reader gets "1.234,56" and "27 sept" without picking a
 *    format. A saved interface language counts as their first choice, ahead
 *    of the browser's.
 */
export function resolveLocale({
  preferred,
  homeCurrency,
  acceptLanguage,
  language,
}: {
  preferred?: string | null;
  homeCurrency?: string | null;
  acceptLanguage?: string | null;
  /** The saved interface language, if any. */
  language?: string | null;
}): FormatLocale {
  if (isFormatLocale(preferred)) return preferred;

  const householdLocale = homeCurrency ? currencyHomeLocale(homeCurrency) : DEFAULT_LOCALE;
  // A saved language goes first, but a browser tag in that same language
  // ("es-MX" for "es") keeps its region ahead of the bare language.
  const browserTags = parseAcceptLanguage(acceptLanguage);
  const tags = language
    ? [
        ...browserTags.filter((tag) => languageOf(tag) === language),
        language,
        ...browserTags.filter((tag) => languageOf(tag) !== language),
      ]
    : browserTags;
  for (const tag of tags) {
    const browserLocale = matchFormatLocale(tag);
    if (!browserLocale) continue;
    return languageOf(browserLocale) === languageOf(householdLocale)
      ? householdLocale
      : browserLocale;
  }
  return householdLocale;
}

function isSupportedLanguage(value: unknown): value is UiLanguage {
  return (UI_LANGUAGES as readonly unknown[]).includes(value);
}

/**
 * Pick the interface language: the user's saved choice, else the language of
 * their resolved number and date format (so "es-CO" reads in Spanish), else
 * English for formats whose language isn't translated yet.
 */
export function resolveLanguage({
  preferred,
  locale,
}: {
  preferred?: string | null;
  locale: string;
}): UiLanguage {
  if (isSupportedLanguage(preferred)) return preferred;
  const language = languageOf(locale);
  return isSupportedLanguage(language) ? language : "en";
}
