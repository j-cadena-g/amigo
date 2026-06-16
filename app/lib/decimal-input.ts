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

export function isPositiveDecimal(value: string): boolean {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount > 0;
}
