import type { CurrencyCode } from "@amigo/db";
import { formatCents } from "@/app/lib/currency";

const HIDDEN_AUDIT_FIELDS = new Set([
  "id",
  "householdId",
  "exchangeRateToHome",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "transferredFromUserId",
  "userDisplayName",
]);

/** Integer-cents money fields denominated in the record currency. */
const RECORD_MONEY_AUDIT_FIELDS = new Set([
  "balance",
  "amount",
  "limitAmount",
  "balanceInitial",
  "balanceCurrent",
  "creditLimit",
  "availableCredit",
  "loanAmount",
  "totalPaid",
]);

/** Integer-cents money fields denominated in household home currency. */
const HOME_MONEY_AUDIT_FIELDS = new Set(["limitAmountHome"]);

export type AuditChange = { from: unknown; to: unknown };

export function formatAuditAction(action: string): string {
  switch (action) {
    case "INSERT":
      return "Created";
    case "UPDATE":
      return "Updated";
    case "DELETE":
      return "Deleted";
    default:
      return action;
  }
}

export function formatAuditFieldName(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (
    value === "CAD" ||
    value === "USD" ||
    value === "EUR" ||
    value === "GBP" ||
    value === "MXN"
  );
}

function currencySideFromChange(
  change: unknown,
  side: "from" | "to"
): CurrencyCode | undefined {
  if (!change || typeof change !== "object") return undefined;
  const value = (change as AuditChange)[side];
  return isCurrencyCode(value) ? value : undefined;
}

/** Record-currency for each side of a change set (falls back across sides). */
export function sideCurrenciesFromAuditChanges(
  changes: Record<string, unknown> | null
): { from?: CurrencyCode; to?: CurrencyCode } {
  if (!changes) return {};
  const from = currencySideFromChange(changes.currency, "from");
  const to = currencySideFromChange(changes.currency, "to");
  return {
    from: from ?? to,
    to: to ?? from,
  };
}

export type AuditRecordCurrency = {
  from?: string | null;
  to?: string | null;
};

/**
 * Prefer currencies from the change delta; fall back to snapshot currencies
 * so amount-only updates still format with the historical record currency.
 */
export function resolveAuditEntryCurrencies(
  changes: Record<string, unknown> | null,
  recordCurrency?: AuditRecordCurrency | null
): { from?: CurrencyCode; to?: CurrencyCode } {
  const fromChanges = sideCurrenciesFromAuditChanges(changes);
  const fromSnap = isCurrencyCode(recordCurrency?.from)
    ? recordCurrency.from
    : undefined;
  const toSnap = isCurrencyCode(recordCurrency?.to)
    ? recordCurrency.to
    : undefined;
  return {
    from: fromChanges.from ?? fromSnap ?? toSnap,
    to: fromChanges.to ?? toSnap ?? fromSnap,
  };
}

/** @deprecated Prefer resolveAuditEntryCurrencies for from/to accuracy. */
export function currencyFromAuditChanges(
  changes: Record<string, unknown> | null
): CurrencyCode | undefined {
  const sides = sideCurrenciesFromAuditChanges(changes);
  return sides.to ?? sides.from;
}

function formatBareCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatAuditValue(
  value: unknown,
  options?: {
    field?: string;
    currency?: CurrencyCode | null;
    homeCurrency?: CurrencyCode | null;
  }
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (options?.field && HOME_MONEY_AUDIT_FIELDS.has(options.field)) {
      if (options.homeCurrency) {
        return formatCents(value, options.homeCurrency);
      }
      // Avoid labeling home-currency cents with the record currency.
      return formatBareCents(value);
    }
    if (options?.field && RECORD_MONEY_AUDIT_FIELDS.has(options.field)) {
      if (options.currency) {
        return formatCents(value, options.currency);
      }
      return formatBareCents(value);
    }
    return String(value);
  }
  if (typeof value === "string") return value === "" ? "—" : value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function visibleAuditChanges(
  changes: Record<string, unknown> | null
): [string, AuditChange][] {
  if (!changes) return [];
  return Object.entries(changes).filter(
    ([key, value]) =>
      !HIDDEN_AUDIT_FIELDS.has(key) &&
      value !== null &&
      typeof value === "object" &&
      "from" in (value as object) &&
      "to" in (value as object)
  ) as [string, AuditChange][];
}

export function resolveAuditTimeZone(timeZone?: string): string {
  if (!timeZone) return "UTC";
  try {
    // Throws RangeError for invalid IANA zones.
    new Intl.DateTimeFormat(undefined, { timeZone }).format(0);
    return timeZone;
  } catch {
    return "UTC";
  }
}

export function formatAuditTimestamp(
  timestampMs: number,
  timeZone = "UTC"
): string | null {
  if (!Number.isFinite(timestampMs)) return null;
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return null;

  const resolvedZone = resolveAuditTimeZone(timeZone);
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: resolvedZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date);
  }
}

export function auditTimestampIso(timestampMs: number): string | null {
  if (!Number.isFinite(timestampMs)) return null;
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
