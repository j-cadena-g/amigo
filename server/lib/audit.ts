import type { DrizzleD1 } from "@amigo/db";
import { auditLogs } from "@amigo/db";

export async function withAudit<T>(
  db: DrizzleD1,
  opts: {
    tableName: string;
    recordId: string;
    operation: "INSERT" | "UPDATE" | "DELETE";
    oldValues?: unknown;
    newValues?: unknown;
    changedBy: string;
  },
  mutation: () => Promise<T>
): Promise<T> {
  const result = await mutation();
  await db.insert(auditLogs).values({
    tableName: opts.tableName,
    recordId: opts.recordId,
    operation: opts.operation,
    oldValues: opts.oldValues ? JSON.stringify(opts.oldValues) : null,
    newValues: opts.newValues ? JSON.stringify(opts.newValues) : null,
    changedBy: opts.changedBy,
  });
  return result;
}
