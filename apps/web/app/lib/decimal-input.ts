/** Normalize locale-specific decimal separators before sanitization. */
export function normalizeDecimalSeparators(raw: string): string {
  const value = raw.trim();
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // 1.234,56 => comma as decimal, dot as thousands
    if (lastComma > lastDot) return value.replace(/\./g, "").replace(",", ".");
    // 1,234.56 => dot as decimal, comma as thousands
    return value.replace(/,/g, "");
  }

  if (lastComma !== -1) {
    const afterComma = value.slice(lastComma + 1);
    // 1,25 => comma as decimal; 1,250 => comma as thousands
    if (value.indexOf(",") === lastComma && /^\d{1,2}$/.test(afterComma)) {
      return value.replace(",", ".");
    }
    return value.replace(/,/g, "");
  }

  return value;
}

/** Allow digits and a single optional decimal point (max two fractional digits). */
export function sanitizeDecimalInput(raw: string): string {
  let value = raw.replace(/[^\d.]/g, "");
  const dotIndex = value.indexOf(".");
  if (dotIndex !== -1) {
    value =
      value.slice(0, dotIndex + 1) + value.slice(dotIndex + 1).replace(/\./g, "");
    const [whole = "", fraction = ""] = value.split(".");
    value = fraction.length > 0 ? `${whole}.${fraction.slice(0, 2)}` : whole + ".";
  }
  return value;
}

export function parseDecimalInput(raw: string): string {
  return sanitizeDecimalInput(normalizeDecimalSeparators(raw));
}

export function isPositiveDecimal(value: string): boolean {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}
