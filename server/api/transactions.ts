import {
  and,
  eq,
  getDb,
  isNull,
  scopeToHousehold,
  transactions,
  visibleFinancialTransactionsCondition,
} from "@amigo/db";
import { count } from "drizzle-orm";
import type { CurrencyCode } from "@amigo/db";
import { z } from "zod";
import { broadcastToHousehold } from "../lib/realtime";
import { ActionError } from "../lib/errors";
import { toCents } from "../lib/conversions";
import { isValidIsoDateString } from "../lib/dates";
import { getExchangeRateForRecord } from "../lib/exchange-rates";
import {
  parseTransactionsListQuery,
  zCurrencyCode,
} from "../lib/request-validation";
import { withAudit } from "../lib/audit";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatSegments, type ApiHandler } from "./route";
import { getHomeCurrency } from "../lib/household-currency";
import {
  validateFinancialRefs,
  validateImportBudgetAndAccountIds,
} from "../lib/financial-refs";

const currencyEnum = zCurrencyCode;

function isValidImportDateString(val: string): boolean {
  const head = val.includes("T") ? (val.split("T")[0] ?? "") : val;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return false;
  const parts = head.split("-").map((x) => Number(x));
  const y = parts[0];
  const mo = parts[1];
  const d = parts[2];
  if (y === undefined || mo === undefined || d === undefined) return false;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const importDateString = z
  .string()
  .min(10)
  .max(32)
  .refine(isValidImportDateString, {
    message:
      "date must be a valid ISO 8601 calendar day (YYYY-MM-DD, optional time suffix after 'T')",
  });

const calendarDateString = z
  .string()
  .refine(isValidIsoDateString, { message: "date must be YYYY-MM-DD" });

const addTransactionSchema = z.object({
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
  category: z.string().min(1).max(100),
  type: z.enum(["income", "expense"]),
  date: calendarDateString,
  budgetId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  currency: currencyEnum.optional(),
});

const updateTransactionSchema = z.object({
  amount: z.number().positive().optional(),
  description: z.string().max(500).nullable().optional(),
  category: z.string().min(1).max(100).optional(),
  type: z.enum(["income", "expense"]).optional(),
  date: calendarDateString.optional(),
  budgetId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  currency: currencyEnum.optional(),
});

const importRowSchema = z.object({
  date: importDateString,
  type: z.enum(["income", "expense"]),
  category: z.string().min(1).max(100),
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
  currency: currencyEnum.optional(),
  budgetId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  externalId: z.string().max(200).optional(),
});

const importBodySchema = z.object({
  dryRun: z.boolean().optional().default(false),
  rows: z.array(importRowSchema).min(1).max(200),
});

function csvEscape(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const RESERVED_TXN_SPLATS = new Set(["export", "import"]);

export const handleTransactionsRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const segments = getSplatSegments(params);
  const id = segments[0];
  const db = getDb(env.DB);

  if (request.method === "GET" && id === "export") {
    await enforceRateLimit(
      env,
      `${session!.userId}:transactions:export`,
      ROUTE_RATE_LIMITS.transactions.export
    );

    const conditions = [
      scopeToHousehold(transactions.householdId, session!.householdId),
      isNull(transactions.deletedAt),
      visibleFinancialTransactionsCondition(session!.userId),
    ];

    const rows = await db.query.transactions.findMany({
      where: and(...conditions),
      orderBy: (transaction, { desc }) => [
        desc(transaction.date),
        desc(transaction.createdAt),
      ],
      limit: 5000,
    });

    const header = [
      "date",
      "type",
      "category",
      "amount_cents",
      "currency",
      "description",
      "budget_id",
      "account_id",
      "external_id",
      "import_batch_id",
      "reviewed",
    ];
    const lines = [
      header.join(","),
      ...rows.map((t) =>
        [
          csvEscape(t.date),
          csvEscape(t.type),
          csvEscape(t.category),
          csvEscape(t.amount),
          csvEscape(t.currency),
          csvEscape(t.description),
          csvEscape(t.budgetId),
          csvEscape(t.accountId),
          csvEscape(t.externalId),
          csvEscape(t.importBatchId),
          csvEscape(t.reviewed),
        ].join(",")
      ),
    ];

    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="transactions-export.csv"',
      },
    });
  }

  if (request.method === "GET" && !id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:transactions:list`,
      ROUTE_RATE_LIMITS.transactions.list
    );

    const url = new URL(request.url);
    const { page, limit, type } = parseTransactionsListQuery({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
    });
    const offset = (page - 1) * limit;

    const conditions = [
      scopeToHousehold(transactions.householdId, session!.householdId),
      isNull(transactions.deletedAt),
      visibleFinancialTransactionsCondition(session!.userId),
    ];

    if (type) {
      conditions.push(eq(transactions.type, type));
    }

    const items = await db.query.transactions.findMany({
      where: and(...conditions),
      orderBy: (transaction, { desc }) => [
        desc(transaction.date),
        desc(transaction.createdAt),
      ],
      limit: limit + 1,
      offset,
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;

    return Response.json({
      data,
      pagination: { page, limit, hasMore },
    });
  }

  if (request.method === "POST" && id === "import") {
    await enforceRateLimit(
      env,
      `${session!.userId}:transactions:import`,
      ROUTE_RATE_LIMITS.transactions.import
    );

    const parsed = importBodySchema.parse(await request.json());
    await validateImportBudgetAndAccountIds(
      db,
      session!.householdId,
      session!.userId,
      parsed.rows
    );
    const batchId = crypto.randomUUID();

    if (parsed.dryRun) {
      return Response.json({
        ok: true,
        dryRun: true,
        count: parsed.rows.length,
        batchId,
      });
    }

    const homeCurrency = await getHomeCurrency(db, session!.householdId);

    const distinctCurrencies = [
      ...new Set(parsed.rows.map((row) => row.currency ?? homeCurrency)),
    ] as CurrencyCode[];
    const rateByCurrency = new Map<CurrencyCode, number | null>();
    for (const c of distinctCurrencies) {
      rateByCurrency.set(c, await getExchangeRateForRecord(env, c, homeCurrency));
    }

    const seenInBatch = new Set<string>();
    const values = [];
    for (const row of parsed.rows) {
      const externalId = row.externalId?.trim() || null;
      if (externalId) {
        if (seenInBatch.has(externalId)) {
          continue;
        }
        seenInBatch.add(externalId);
      }
      const currency = (row.currency ?? homeCurrency) as CurrencyCode;
      values.push({
        id: crypto.randomUUID(),
        householdId: session!.householdId,
        userId: session!.userId,
        amount: toCents(row.amount),
        currency,
        exchangeRateToHome: rateByCurrency.get(currency) ?? null,
        description: row.description?.trim() || null,
        category: row.category.trim(),
        type: row.type,
        date: row.date.split("T")[0]!,
        budgetId: row.budgetId ?? null,
        accountId: row.accountId ?? null,
        importBatchId: batchId,
        externalId,
      });
    }

    const IMPORT_CHUNK_SIZE = 7;
    if (values.length > 0) {
      const statements = [];
      for (let i = 0; i < values.length; i += IMPORT_CHUNK_SIZE) {
        statements.push(
          db
            .insert(transactions)
            .values(values.slice(i, i + IMPORT_CHUNK_SIZE))
            .onConflictDoNothing({
              target: [transactions.householdId, transactions.externalId],
            })
        );
      }
      await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
    }

    const insertCount = await db
      .select({ inserted: count() })
      .from(transactions)
      .where(
        and(
          scopeToHousehold(transactions.householdId, session!.householdId),
          eq(transactions.importBatchId, batchId)
        )
      );
    const inserted = insertCount[0]?.inserted ?? 0;
    const skipped = parsed.rows.length - inserted;

    await broadcastToHousehold(env, session!.householdId, {
      type: "TRANSACTION_UPDATE",
      action: "batch_create",
      count: inserted,
    });

    return Response.json({ ok: true, inserted, skipped, batchId }, { status: 201 });
  }

  if (request.method === "POST" && !id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:transactions:add`,
      ROUTE_RATE_LIMITS.transactions.create
    );

    const validated = addTransactionSchema.parse(await request.json());
    await validateFinancialRefs(db, session!.householdId, session!.userId, {
      budgetId: validated.budgetId,
      accountId: validated.accountId,
    });
    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const currency = validated.currency ?? homeCurrency;
    const exchangeRateToHome = await getExchangeRateForRecord(
      env,
      currency,
      homeCurrency
    );
    const transactionId = crypto.randomUUID();

    const transaction = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "transactions",
        recordId: transactionId,
        operation: "INSERT",
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .insert(transactions)
          .values({
            id: transactionId,
            householdId: session!.householdId,
            userId: session!.userId,
            amount: toCents(validated.amount),
            currency,
            exchangeRateToHome,
            description: validated.description?.trim() || null,
            category: validated.category.trim(),
            type: validated.type,
            date: validated.date,
            budgetId: validated.budgetId || null,
            accountId: validated.accountId || null,
          })
          .returning()
          .get()
    );

    await broadcastToHousehold(env, session!.householdId, {
      type: "TRANSACTION_UPDATE",
      action: "create",
      entityId: transaction.id,
    });

    return Response.json(transaction, { status: 201 });
  }

  if (request.method === "PATCH" && id && !RESERVED_TXN_SPLATS.has(id)) {
    await enforceRateLimit(
      env,
      `${session!.userId}:transactions:update`,
      ROUTE_RATE_LIMITS.transactions.update
    );

    const validated = updateTransactionSchema.parse(await request.json());
    await validateFinancialRefs(db, session!.householdId, session!.userId, {
      budgetId: validated.budgetId,
      accountId: validated.accountId,
    });
    const updateData: Record<string, unknown> = {};

    if (validated.amount !== undefined) {
      updateData.amount = toCents(validated.amount);
    }
    if (validated.description !== undefined) {
      updateData.description = validated.description?.trim() || null;
    }
    if (validated.category !== undefined) {
      updateData.category = validated.category.trim();
    }
    if (validated.type !== undefined) {
      updateData.type = validated.type;
    }
    if (validated.date !== undefined) {
      updateData.date = validated.date;
    }
    if (validated.budgetId !== undefined) {
      updateData.budgetId = validated.budgetId || null;
    }
    if (validated.accountId !== undefined) {
      updateData.accountId = validated.accountId || null;
    }
    if (validated.currency !== undefined) {
      updateData.currency = validated.currency;
      const homeCurrency = await getHomeCurrency(db, session!.householdId);
      updateData.exchangeRateToHome = await getExchangeRateForRecord(
        env,
        validated.currency,
        homeCurrency
      );
    }

    const visibilityCondition = visibleFinancialTransactionsCondition(session!.userId);

    const existing = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.id, id),
        scopeToHousehold(transactions.householdId, session!.householdId),
        isNull(transactions.deletedAt),
        visibilityCondition
      ),
    });

    if (!existing) {
      throw new ActionError("Transaction not found", "NOT_FOUND");
    }

    const updated = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "transactions",
        recordId: id,
        operation: "UPDATE",
        oldValues: existing,
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(transactions)
          .set(updateData)
          .where(
            and(
              eq(transactions.id, id),
              scopeToHousehold(transactions.householdId, session!.householdId),
              isNull(transactions.deletedAt),
              visibilityCondition
            )
          )
          .returning()
          .get()
    );

    if (!updated) {
      throw new ActionError("Transaction not found", "NOT_FOUND");
    }

    await broadcastToHousehold(env, session!.householdId, {
      type: "TRANSACTION_UPDATE",
      action: "update",
      entityId: id,
    });

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id && !RESERVED_TXN_SPLATS.has(id)) {
    await enforceRateLimit(
      env,
      `${session!.userId}:transactions:delete`,
      ROUTE_RATE_LIMITS.transactions.delete
    );

    const visibilityCondition = visibleFinancialTransactionsCondition(session!.userId);

    const existing = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.id, id),
        scopeToHousehold(transactions.householdId, session!.householdId),
        isNull(transactions.deletedAt),
        visibilityCondition
      ),
    });

    if (!existing) {
      throw new ActionError("Transaction not found", "NOT_FOUND");
    }

    const deleted = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "transactions",
        recordId: id,
        operation: "DELETE",
        oldValues: existing,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(transactions)
          .set({ deletedAt: new Date(), externalId: null })
          .where(
            and(
              eq(transactions.id, id),
              scopeToHousehold(transactions.householdId, session!.householdId),
              isNull(transactions.deletedAt),
              visibilityCondition
            )
          )
          .returning()
          .get()
    );

    if (!deleted) {
      throw new ActionError("Transaction not found", "NOT_FOUND");
    }

    await broadcastToHousehold(env, session!.householdId, {
      type: "TRANSACTION_UPDATE",
      action: "delete",
      entityId: id,
    });

    return Response.json(deleted);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
