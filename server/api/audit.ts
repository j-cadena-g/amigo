import { Hono } from "hono";
import { getDb, auditLogs, users, and, desc, eq, inArray } from "@amigo/db";
import type { HonoEnv } from "../env";
import { ActionError } from "../lib/errors";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { z } from "zod";
import { AUDIT_TABLES, buildAuditHistoryFilter } from "../lib/audit";

interface AuditEntry {
  id: string;
  action: string;
  userName: string | null;
  timestamp: number; // ms since epoch
  changes: Record<string, unknown> | null;
}

export const auditTableSchema = z.enum(AUDIT_TABLES);

export const auditRoute = new Hono<HonoEnv>().get("/:recordId", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `audit:${session.userId}`,
    ROUTE_RATE_LIMITS.audit.list
  );

  const recordId = c.req.param("recordId");
  const tableNameParam = c.req.query("table");
  if (!tableNameParam) {
    throw new ActionError("table query param required", "VALIDATION_ERROR");
  }
  const tableName = auditTableSchema.parse(tableNameParam);

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
    .where(buildAuditHistoryFilter(session.householdId, recordId, tableName))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);

  // Look up user names for changedBy user IDs
  const userIds = [
    ...new Set(
      logs
        .map((l) => l.changedBy)
        .filter((userId): userId is string => typeof userId === "string")
    ),
  ];
  const userMap = new Map<string, string>();

  if (userIds.length > 0) {
    const householdUsers = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.householdId, session.householdId),
          inArray(users.id, userIds)
        )
      )
      .all();

    for (const u of householdUsers) {
      userMap.set(u.id, u.name ?? u.email);
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
