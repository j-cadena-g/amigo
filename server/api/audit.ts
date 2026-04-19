import { and, auditLogs, desc, eq, getDb, inArray, users } from "@amigo/db";
import { z } from "zod";
import { ActionError } from "../lib/errors";
import { AUDIT_TABLES, buildAuditHistoryFilter } from "../lib/audit";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatSegments, type ApiHandler } from "./route";

interface AuditEntry {
  id: string;
  action: string;
  userName: string | null;
  timestamp: number;
  changes: Record<string, unknown> | null;
}

export const auditTableSchema = z.enum(AUDIT_TABLES);

export const handleAuditRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  if (request.method !== "GET") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  await enforceRateLimit(
    env.CACHE,
    `audit:${session!.userId}`,
    ROUTE_RATE_LIMITS.audit.list
  );

  const [recordId] = getSplatSegments(params);
  if (!recordId) {
    throw new ActionError("recordId path param required", "VALIDATION_ERROR");
  }

  const tableNameParam = new URL(request.url).searchParams.get("table");
  if (!tableNameParam) {
    throw new ActionError("table query param required", "VALIDATION_ERROR");
  }

  const tableName = auditTableSchema.parse(tableNameParam);
  const db = getDb(env.DB);

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
    .where(buildAuditHistoryFilter(session!.householdId, recordId, tableName))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);

  const userIds = [
    ...new Set(
      logs
        .map((log) => log.changedBy)
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
          eq(users.householdId, session!.householdId),
          inArray(users.id, userIds)
        )
      )
      .all();

    for (const user of householdUsers) {
      userMap.set(user.id, user.name ?? user.email);
    }
  }

  const history: AuditEntry[] = logs.map((log) => {
    const userName = log.changedBy ? userMap.get(log.changedBy) ?? null : null;

    let changes: Record<string, unknown> | null = null;
    if (log.operation === "UPDATE" && log.oldValues && log.newValues) {
      const oldValues = log.oldValues as Record<string, unknown>;
      const newValues = log.newValues as Record<string, unknown>;
      changes = {};

      for (const key of Object.keys(newValues)) {
        if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
          changes[key] = { from: oldValues[key], to: newValues[key] };
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

  return Response.json({ history });
};
