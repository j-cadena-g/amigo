import type { DrizzleD1 } from "@amigo/db";
import { and, auditLogs, eq } from "@amigo/db";

export const AUDIT_TABLES = [
  "grocery_items",
  "transactions",
  "budgets",
  "financial_accounts",
  "assets",
  "debts",
  "recurring_transactions",
] as const;
export type AuditTableName = (typeof AUDIT_TABLES)[number];

export type AuditFieldChange = { from: unknown; to: unknown };

/**
 * Normalize an audit snapshot from D1.
 *
 * `audit_logs.old_values` / `new_values` are json-mode text columns, so Drizzle
 * stringifies on write and parses on read. Historical rows were also
 * `JSON.stringify`'d before insert, so a read can still be a JSON string.
 * Diffing that string with `Object.keys` produces character-index "fields"
 * (`367: 5 → 6`) instead of real column changes.
 */
export function parseAuditSnapshot(
  value: unknown
): Record<string, unknown> | null {
  let current = value;
  for (let i = 0; i < 3 && typeof current === "string"; i++) {
    try {
      current = JSON.parse(current);
    } catch {
      return null;
    }
  }
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current as Record<string, unknown>;
  }
  return null;
}

export function snapshotCurrency(values: unknown): string | null {
  const snapshot = parseAuditSnapshot(values);
  if (!snapshot) return null;
  return typeof snapshot.currency === "string" ? snapshot.currency : null;
}

export function diffAuditSnapshots(
  oldValues: unknown,
  newValues: unknown
): Record<string, AuditFieldChange> | null {
  const oldSnapshot = parseAuditSnapshot(oldValues);
  const newSnapshot = parseAuditSnapshot(newValues);
  if (!oldSnapshot || !newSnapshot) return null;

  const changes: Record<string, AuditFieldChange> = {};
  const changedKeys = new Set([
    ...Object.keys(oldSnapshot),
    ...Object.keys(newSnapshot),
  ]);

  for (const key of changedKeys) {
    if (JSON.stringify(oldSnapshot[key]) !== JSON.stringify(newSnapshot[key])) {
      changes[key] = { from: oldSnapshot[key], to: newSnapshot[key] };
    }
  }

  return changes;
}

export function buildAuditHistoryFilter(
  householdId: string,
  recordId: string,
  tableName: AuditTableName
) {
  return and(
    eq(auditLogs.householdId, householdId),
    eq(auditLogs.recordId, recordId),
    eq(auditLogs.tableName, tableName)
  );
}

/**
 * Inserts many audit rows in one statement (e.g. after a bulk delete).
 * Failures are logged and swallowed so the committed mutation is not rolled back.
 */
export async function insertManyAuditLogs(
  db: DrizzleD1,
  rows: Array<{
    householdId: string;
    tableName: string;
    recordId: string;
    operation: "INSERT" | "UPDATE" | "DELETE";
    oldValues?: unknown;
    newValues?: unknown;
    changedBy: string;
  }>
): Promise<void> {
  if (rows.length === 0) return;
  try {
    await db.insert(auditLogs).values(
      rows.map((row) => ({
        householdId: row.householdId,
        tableName: row.tableName,
        recordId: row.recordId,
        operation: row.operation,
        oldValues: row.oldValues ?? null,
        newValues: row.newValues ?? null,
        changedBy: row.changedBy,
      }))
    );
  } catch (error) {
    console.error("Batch audit log write failed", {
      error,
      count: rows.length,
      householdId: rows[0]?.householdId,
      tableName: rows[0]?.tableName,
      operation: rows[0]?.operation,
      changedBy: rows[0]?.changedBy,
    });
  }
}

type AuditSnapshot = string | number | boolean | null | Record<string, unknown> | unknown[];
type AuditValue<T> = AuditSnapshot | ((result: T) => AuditSnapshot);

export async function withAudit<T>(
  db: DrizzleD1,
  opts: {
    householdId: string;
    tableName: string;
    recordId: string;
    operation: "INSERT" | "UPDATE" | "DELETE";
    oldValues?: AuditValue<T>;
    newValues?: AuditValue<T>;
    changedBy: string;
  },
  mutation: () => Promise<T>
): Promise<T> {
  const result = await mutation();
  const oldValues =
    typeof opts.oldValues === "function" ? opts.oldValues(result) : opts.oldValues;
  const newValues =
    typeof opts.newValues === "function" ? opts.newValues(result) : opts.newValues;

  try {
    await db.insert(auditLogs).values({
      householdId: opts.householdId,
      tableName: opts.tableName,
      recordId: opts.recordId,
      operation: opts.operation,
      oldValues: oldValues ?? null,
      newValues: newValues ?? null,
      changedBy: opts.changedBy,
    });
  } catch (error) {
    console.error("Audit log write failed", {
      error,
      householdId: opts.householdId,
      tableName: opts.tableName,
      recordId: opts.recordId,
      operation: opts.operation,
      changedBy: opts.changedBy,
    });
    return result;
  }
  return result;
}
