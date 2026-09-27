const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Uppercase the first letter for headings: Spanish and French month and
 * weekday names are lowercase mid-sentence ("septiembre de 2026").
 */
export function capitalizeFirst(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Format a calendar date relative to household-local today (YYYY-MM-DD). */
export function formatRelativeDate(
  dateStr: string,
  todayIso: string,
  locale: string
): string {
  const targetIso = dateStr.split("T")[0]!;
  const targetUtc = Date.parse(`${targetIso}T00:00:00Z`);
  const todayUtc = Date.parse(`${todayIso}T00:00:00Z`);
  const diffDays = Math.round((targetUtc - todayUtc) / MS_PER_DAY);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays}d`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}d ago`;

  return formatLedgerDate(targetIso, locale);
}

/**
 * Short month and day for ledger date columns: "Sep 23", "27 sept", "23. Sept.".
 * Word connectives like Spanish "de" become a space so the narrow column
 * doesn't wrap; punctuation such as the German ordinal period stays.
 */
export function formatLedgerDate(date: string, locale: string): string {
  const dateOnly = date.split("T")[0]!;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
    .formatToParts(new Date(`${dateOnly}T00:00:00Z`))
    .map((part) => (part.type === "literal" && /\p{L}/u.test(part.value) ? " " : part.value))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatTransactionDate(date: string, locale: string): string {
  const dateOnly = date.split("T")[0]!;
  const d = new Date(dateOnly + "T00:00:00Z");
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const LEDGER_WIDTH_CACHE_LIMIT = 64;
const ledgerWidthCache = new Map<string, string>();

/**
 * Width for a ledger date column that fits the locale's longest short date
 * ("Sep 23" in English, "23. Sept." in German) on one line, never narrower
 * than the original 3.5rem. `ch` matches the column's monospace digits.
 */
export function ledgerDateColumnWidth(locale: string): string {
  let width = ledgerWidthCache.get(locale);
  if (!width) {
    let longest = 0;
    for (let month = 1; month <= 12; month++) {
      const date = `2026-${String(month).padStart(2, "0")}-28`;
      longest = Math.max(longest, formatLedgerDate(date, locale).length);
    }
    width = `max(3.5rem, ${longest}ch)`;
    if (ledgerWidthCache.size >= LEDGER_WIDTH_CACHE_LIMIT) ledgerWidthCache.clear();
    ledgerWidthCache.set(locale, width);
  }
  return width;
}
