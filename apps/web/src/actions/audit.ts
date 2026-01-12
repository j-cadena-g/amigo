"use server";

import { db, eq, and, desc } from "@amigo/db";
import { auditLogs, users } from "@amigo/db/schema";
import { getSession } from "@/lib/session";

interface AuditEntry {
  id: string;
  action: string;
  userName: string | null;
  timestamp: string;
  changes: Record<string, unknown> | null;
}

interface GetRecordHistoryResult {
  success: boolean;
  error?: string;
  history?: AuditEntry[];
}

/**
 * Get the audit history for a specific record.
 * Returns a timeline of changes with user information.
 */
export async function getRecordHistory(
  recordId: string,
  tableName: string
): Promise<GetRecordHistoryResult> {
  const session = await getSession();

  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Query audit logs for this record
    const logs = await db
      .select({
        id: auditLogs.id,
        operation: auditLogs.operation,
        changedBy: auditLogs.changedBy,
        oldValues: auditLogs.oldValues,
        newValues: auditLogs.newValues,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.recordId, recordId),
          eq(auditLogs.tableName, tableName)
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    // Collect unique auth IDs to look up user names
    const authIds = [...new Set(logs.map((l) => l.changedBy).filter(Boolean))];

    // Look up user names for auth IDs
    const userMap = new Map<string, string>();
    if (authIds.length > 0) {
      const userResults = await db
        .select({
          authId: users.authId,
          name: users.name,
          email: users.email,
        })
        .from(users);

      for (const user of userResults) {
        if (user.authId) {
          userMap.set(user.authId, user.name ?? user.email);
        }
      }
    }

    // Map logs to response format
    const history: AuditEntry[] = logs.map((log) => {
      const userName = log.changedBy ? userMap.get(log.changedBy) ?? null : null;

      // For updates, compute the changes
      let changes: Record<string, unknown> | null = null;
      if (log.operation === "UPDATE" && log.oldValues && log.newValues) {
        const oldVals = log.oldValues as Record<string, unknown>;
        const newVals = log.newValues as Record<string, unknown>;
        changes = {};

        for (const key of Object.keys(newVals)) {
          if (JSON.stringify(oldVals[key]) !== JSON.stringify(newVals[key])) {
            changes[key] = { from: oldVals[key], to: newVals[key] };
          }
        }
      }

      return {
        id: log.id,
        action: log.operation,
        userName,
        timestamp: log.createdAt.toISOString(),
        changes,
      };
    });

    return { success: true, history };
  } catch (error) {
    console.error("Failed to get record history:", error);
    return { success: false, error: "Failed to get record history" };
  }
}
