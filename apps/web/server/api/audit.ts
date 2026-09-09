import {
  and,
  assets,
  auditLogs,
  budgets,
  debts,
  desc,
  eq,
  financialAccounts,
  getDb,
  groceryItems,
  inArray,
  isNull,
  or,
  recurringTransactions,
  scopeToHousehold,
  transactions,
  users,
  visibleBudgetsCondition,
  visibleFinancialAccountsCondition,
  visibleFinancialTransactionsCondition,
  visibleRecurringRulesCondition,
} from "@amigo/db";
import { z } from "zod";
import { ActionError } from "../lib/errors";
import {
  AUDIT_TABLES,
  buildAuditHistoryFilter,
  diffAuditSnapshots,
  snapshotCurrency,
} from "../lib/audit";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatSegments, type ApiHandler } from "./route";

interface AuditEntry {
  id: string;
  action: string;
  userName: string | null;
  timestamp: number;
  changes: Record<string, unknown> | null;
  /** Currency from full snapshots (present even when currency did not change). */
  recordCurrency: { from: string | null; to: string | null };
}

export const auditTableSchema = z.enum(AUDIT_TABLES);

function orOwnerOrShared(column: typeof assets.userId | typeof debts.userId, viewerUserId: string) {
  return or(eq(column, viewerUserId), isNull(column));
}

async function assertCanViewAuditRecord(
  db: ReturnType<typeof getDb>,
  session: NonNullable<Parameters<ApiHandler>[0]["session"]>,
  tableName: (typeof AUDIT_TABLES)[number],
  recordId: string
) {
  const householdId = session.householdId;
  const viewerUserId = session.userId;
  let record: unknown;

  switch (tableName) {
    case "grocery_items":
      record = await db.query.groceryItems.findFirst({
        where: and(
          eq(groceryItems.id, recordId),
          scopeToHousehold(groceryItems.householdId, householdId),
          isNull(groceryItems.deletedAt)
        ),
      });
      break;
    case "transactions":
      record = await db.query.transactions.findFirst({
        where: and(
          eq(transactions.id, recordId),
          scopeToHousehold(transactions.householdId, householdId),
          isNull(transactions.deletedAt),
          visibleFinancialTransactionsCondition(viewerUserId)
        ),
      });
      break;
    case "budgets":
      record = await db.query.budgets.findFirst({
        where: and(
          eq(budgets.id, recordId),
          scopeToHousehold(budgets.householdId, householdId),
          isNull(budgets.deletedAt),
          visibleBudgetsCondition(viewerUserId)
        ),
      });
      break;
    case "financial_accounts":
      record = await db.query.financialAccounts.findFirst({
        where: and(
          eq(financialAccounts.id, recordId),
          scopeToHousehold(financialAccounts.householdId, householdId),
          isNull(financialAccounts.deletedAt),
          visibleFinancialAccountsCondition(viewerUserId)
        ),
      });
      break;
    case "assets":
      record = await db.query.assets.findFirst({
        where: and(
          eq(assets.id, recordId),
          scopeToHousehold(assets.householdId, householdId),
          isNull(assets.deletedAt),
          orOwnerOrShared(assets.userId, viewerUserId)
        ),
      });
      break;
    case "debts":
      record = await db.query.debts.findFirst({
        where: and(
          eq(debts.id, recordId),
          scopeToHousehold(debts.householdId, householdId),
          isNull(debts.deletedAt),
          orOwnerOrShared(debts.userId, viewerUserId)
        ),
      });
      break;
    case "recurring_transactions":
      // Tombstones remain readable for audit history authorization.
      record = await db.query.recurringTransactions.findFirst({
        where: and(
          eq(recurringTransactions.id, recordId),
          scopeToHousehold(recurringTransactions.householdId, householdId),
          visibleRecurringRulesCondition(viewerUserId)
        ),
      });
      break;
  }

  if (!record) {
    throw new ActionError("Audit record not found", "NOT_FOUND");
  }
}

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

  await enforceRateLimit(env, `audit:${session!.userId}`, ROUTE_RATE_LIMITS.audit.list);

  const splatSegments = getSplatSegments(params);
  if (splatSegments.length === 0) {
    throw new ActionError("recordId path param required", "VALIDATION_ERROR");
  }
  if (splatSegments.length > 1) {
    throw new ActionError(
      "recordId must be a single path segment",
      "VALIDATION_ERROR"
    );
  }
  const recordId = splatSegments[0]!;

  const tableNameParam = new URL(request.url).searchParams.get("table");
  if (!tableNameParam) {
    throw new ActionError("table query param required", "VALIDATION_ERROR");
  }

  const tableName = auditTableSchema.parse(tableNameParam);
  const db = getDb(env.DB);
  await assertCanViewAuditRecord(db, session!, tableName, recordId);

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

    const changes =
      log.operation === "UPDATE"
        ? diffAuditSnapshots(log.oldValues, log.newValues)
        : null;

    return {
      id: log.id,
      action: log.operation,
      userName,
      timestamp: log.createdAt.getTime(),
      changes,
      recordCurrency: {
        from: snapshotCurrency(log.oldValues),
        to: snapshotCurrency(log.newValues),
      },
    };
  });

  return Response.json({ history });
};
