import type { DrizzleD1 } from "@amigo/db";
import { and, auditLogs, eq } from "@amigo/db";

export const AUDIT_TABLES = ["grocery_items", "transactions"] as const;
export type AuditTableName = (typeof AUDIT_TABLES)[number];

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

type AuditValue<T> = unknown | ((result: T) => unknown);

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

  await db.insert(auditLogs).values({
    householdId: opts.householdId,
    tableName: opts.tableName,
    recordId: opts.recordId,
    operation: opts.operation,
    oldValues: oldValues ? JSON.stringify(oldValues) : null,
    newValues: newValues ? JSON.stringify(newValues) : null,
    changedBy: opts.changedBy,
  });
  return result;
}
