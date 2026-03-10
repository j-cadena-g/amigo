import { Hono } from "hono";
import { getDb, auditLogs, users, eq, and, desc } from "@amigo/db";
import type { HonoEnv } from "../env";
import { ActionError } from "../lib/errors";
import { enforceRateLimit, RATE_LIMIT_PRESETS } from "../middleware/rate-limit";

interface AuditEntry {
  id: string;
  action: string;
  userName: string | null;
  timestamp: number; // ms since epoch
  changes: Record<string, unknown> | null;
}

export const auditRoute = new Hono<HonoEnv>().get("/:recordId", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(c.env.CACHE, `audit:${session.userId}`, RATE_LIMIT_PRESETS.READ);

  const recordId = c.req.param("recordId");
  const tableName = c.req.query("table");
  if (!tableName) {
    throw new ActionError("table query param required", "VALIDATION_ERROR");
  }

  const db = getDb(c.env.DB);

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
      and(eq(auditLogs.recordId, recordId), eq(auditLogs.tableName, tableName))
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);

  // Look up user names for changedBy auth IDs
  const authIds = [...new Set(logs.map((l) => l.changedBy).filter(Boolean))];
  const userMap = new Map<string, string>();

  if (authIds.length > 0) {
    const allUsers = await db
      .select({ authId: users.authId, name: users.name, email: users.email })
      .from(users)
      .all();

    for (const u of allUsers) {
      userMap.set(u.authId, u.name ?? u.email);
    }
  }

  const history: AuditEntry[] = logs.map((log) => {
    const userName = log.changedBy ? userMap.get(log.changedBy) ?? null : null;

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
      timestamp: log.createdAt.getTime(),
      changes,
    };
  });

  return c.json({ history });
});
