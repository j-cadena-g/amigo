import {
  and,
  budgets,
  financialAccounts,
  visibleFinancialAccountsCondition,
  eq,
  getDb,
  isNull,
  scopeToHousehold,
  transactions,
  visibleFinancialTransactionsCondition,
} from "@amigo/db";
import { count, inArray } from "drizzle-orm";
import { loadViewerRegion } from "@/app/lib/locale.server";
import { currencyCorrectionMatches, correctImportCurrency } from "../lib/import-currency";
import { parseWealthsimpleCsv } from "../lib/wealthsimple-csv";
import { parseOfx, MAX_OFX_BYTES, type OfxRow } from "../lib/ofx";
import { cleanBankDescription, isPersonToPerson } from "../lib/bank-description";
import { suggestMerchantNames } from "../lib/merchant-names";
import { suggestTransactionCategories, type TransactionCategoryRequest } from "../lib/transaction-category";
import {
  isUncategorizedCategoryName,
  learnMerchantAliasFromEdit,
  lessonForMerchant,
  logMerchantAliasFailure,
  suggestMerchantImportRows,
  upsertAiAlias,
  upsertUserAlias,
  usableAliasCategoryIds,
  type MerchantImportSuggestion,
  type MerchantLessonRow,
} from "../lib/merchant-aliases";
import type { CurrencyCode, DrizzleD1, Transaction, UiLanguage } from "@amigo/db";
import { z } from "zod";
import { broadcastToHousehold } from "../lib/realtime";
import { ActionError } from "../lib/errors";
import type { AppSession, Env } from "../env";
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
  refsChangedFromExisting,
  validateFinancialRefs,
  validateImportBudgetAndAccountIds,
} from "../lib/financial-refs";
import {
  assertSelectableFinancialCategory,
  resolveOrCreateImportCategory,
} from "../lib/financial-categories";

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

/**
 * What the card or bank actually charged, fees included, as integer cents of
 * `chargedCurrency` (defaults to the household home currency): the same unit
 * the API returns for `chargedAmount`.
 */
const chargedAmountCents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

function chargedCurrencyHasAmount(value: {
  chargedAmount?: number | null;
  chargedCurrency?: CurrencyCode;
}): boolean {
  return value.chargedCurrency === undefined || value.chargedAmount != null;
}

const CHARGED_CURRENCY_NEEDS_AMOUNT = {
  message: "chargedCurrency requires chargedAmount",
  path: ["chargedCurrency"],
};

const CLEARED_CHARGE = {
  chargedAmount: null,
  chargedCurrency: null,
  chargedExchangeRateToHome: null,
} as const;

function assertChargeCurrencyDiffers(
  chargedCurrency: CurrencyCode,
  transactionCurrency: CurrencyCode
) {
  if (chargedCurrency === transactionCurrency) {
    throw new ActionError(
      "chargedCurrency must differ from the transaction currency",
      "VALIDATION_ERROR"
    );
  }
}

/** Charge columns for a recorded card charge, with its FX snapshot to home. */
async function resolveCharge(
  env: Env,
  homeCurrency: CurrencyCode,
  transactionCurrency: CurrencyCode,
  chargedAmount: number,
  chargedCurrency: CurrencyCode
) {
  assertChargeCurrencyDiffers(chargedCurrency, transactionCurrency);
  const rate = await getExchangeRateForRecord(env, chargedCurrency, homeCurrency);
  if (rate === null && chargedCurrency !== homeCurrency) {
    throw new Error(
      `Missing exchange rate from ${chargedCurrency} to ${homeCurrency} for charged amount`
    );
  }
  return { chargedAmount, chargedCurrency, chargedExchangeRateToHome: rate };
}

/**
 * Not a uuid: accounts made by the asset-convert endpoint have ids like
 * `from-asset-<uuid>`. Existence and visibility are checked in financial-refs.
 */
const accountIdField = z.string().min(1).max(100).nullable().optional();

const reminderInstant = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00(?:\.000)?)?Z$/.test(value)) return false;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 16) === value.slice(0, 16);
}, { message: "Reminder times must be valid UTC ISO instants with minute precision" })
  .transform((value) => new Date(value).toISOString());

const reminderTimesField = z.array(reminderInstant)
  .max(4)
  .refine((times) => new Set(times).size === times.length, {
    message: "Reminder times must be unique",
  })
  .transform((times) => times.sort())
  .optional();

function assertFutureReminders(times: string[], existingTimes: string[] = []) {
  const existing = new Set(existingTimes);
  const now = Date.now();
  if (times.some((time) => !existing.has(time) && new Date(time).getTime() <= now)) {
    throw new ActionError("New reminder times must be in the future", "VALIDATION_ERROR");
  }
}

const addTransactionSchema = z.object({
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
  categoryId: z.string().uuid(),
  type: z.enum(["income", "expense"]),
  date: calendarDateString,
  budgetId: z.string().uuid().nullable().optional(),
  accountId: accountIdField,
  currency: currencyEnum.optional(),
  chargedAmount: chargedAmountCents.nullable().optional(),
  chargedCurrency: currencyEnum.optional(),
  reminderTimes: reminderTimesField,
  reminderUserId: z.never().optional(),
}).refine(chargedCurrencyHasAmount, CHARGED_CURRENCY_NEEDS_AMOUNT);

const updateTransactionSchema = z.object({
  amount: z.number().positive().optional(),
  description: z.string().max(500).nullable().optional(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(["income", "expense"]).optional(),
  date: calendarDateString.optional(),
  budgetId: z.string().uuid().nullable().optional(),
  accountId: accountIdField,
  currency: currencyEnum.optional(),
  chargedAmount: chargedAmountCents.nullable().optional(),
  chargedCurrency: currencyEnum.optional(),
  reviewed: z.boolean().optional(),
  reminderTimes: reminderTimesField,
  reminderUserId: z.never().optional(),
}).refine(chargedCurrencyHasAmount, CHARGED_CURRENCY_NEEDS_AMOUNT);

const importRowSchema = z.object({
  date: importDateString,
  type: z.enum(["income", "expense"]),
  category: z.string().min(1).max(100),
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
  currency: currencyEnum.optional(),
  budgetId: z.string().uuid().nullable().optional(),
  accountId: accountIdField,
  externalId: z.string().max(200).optional(),
});

const importBodySchema = z.object({
  dryRun: z.boolean().optional().default(false),
  rows: z.array(importRowSchema).min(1).max(200),
});

type CleanImportRow = Omit<OfxRow, "description"> & {
  description: string | null;
  bankDescription: string | null;
};

/** Shared by the rename and category steps on a file preview. */
const IMPORT_PREVIEW_AI_DEADLINE_MS = 12_000;

/** Bank charges keep their label, and transfers between people never reach the model. */
function rowSkipsAiName(
  row: { bankDescription: string | null },
  language: UiLanguage
): boolean {
  if (!row.bankDescription) return true;
  return (
    isPersonToPerson(row.bankDescription) ||
    cleanBankDescription(row.bankDescription, language).charge
  );
}

async function previewMerchantNames(
  env: Env,
  db: DrizzleD1,
  householdId: string,
  rows: readonly { bankDescription: string | null }[],
  suggestions: readonly MerchantImportSuggestion[],
  language: UiLanguage,
  homeCurrency: CurrencyCode,
  deadlineMs: number
): Promise<Map<string, string>> {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < suggestions.length; index++) {
    const suggestion = suggestions[index]!;
    const row = rows[index];
    if (!suggestion.merchantKey || suggestion.nameSource !== "none" || !row) continue;
    if (rowSkipsAiName(row, language)) continue;
    if (seen.has(suggestion.merchantKey)) continue;
    seen.add(suggestion.merchantKey);
    keys.push(suggestion.merchantKey);
  }
  if (keys.length === 0) return new Map();
  const cleaned = new Map<string, string | null>();
  suggestions.forEach((suggestion) => {
    if (suggestion.merchantKey) cleaned.set(suggestion.merchantKey, suggestion.description);
  });
  const named = await suggestMerchantNames(env, db, keys, {
    language,
    homeCurrency,
    deadlineMs,
  });
  // A name the cleaner already produced isn't a suggestion worth saving or labeling.
  const names = new Map([...named].filter(([key, name]) => name !== cleaned.get(key)));
  // Show only names that were saved: confirm reads them back from memory.
  const saved = await Promise.all(
    [...names].map(([key, name]) =>
      upsertAiAlias(db, householdId, key, { displayName: name }).then(
        (written) => (written ? ([key, name] as const) : null),
        () => {
          logMerchantAliasFailure();
          return null;
        }
      )
    )
  );
  return new Map(saved.filter((entry) => entry !== null));
}

/**
 * Category suggestions for merchants with nothing remembered. Transfers between
 * people never reach Jev; bank charges do. Jev bills gateway credits, not neurons.
 */
async function previewTransactionCategories(
  env: Env,
  db: DrizzleD1,
  householdId: string,
  rows: readonly { bankDescription: string | null; type: "income" | "expense" }[],
  suggestions: readonly MerchantImportSuggestion[],
  aiNames: ReadonlyMap<string, string>,
  homeCurrency: CurrencyCode,
  deadlineMs: number
) {
  const requests: TransactionCategoryRequest[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < suggestions.length; index++) {
    const suggestion = suggestions[index]!;
    const row = rows[index];
    if (!suggestion.merchantKey || suggestion.categorySource !== "none" || !row) continue;
    if (!row.bankDescription || isPersonToPerson(row.bankDescription)) continue;
    if (seen.has(suggestion.merchantKey)) continue;
    const displayName = (aiNames.get(suggestion.merchantKey) ?? suggestion.description)?.trim();
    if (!displayName) continue;
    seen.add(suggestion.merchantKey);
    requests.push({
      merchantKey: suggestion.merchantKey,
      type: row.type,
      displayName,
      bankText: suggestion.merchantKey,
    });
  }
  return suggestTransactionCategories(env, db, householdId, requests, {
    homeCurrency,
    deadlineMs,
  });
}

function cleanImportRows(rows: OfxRow[], language: UiLanguage): CleanImportRow[] {
  return rows.map((row) => {
    const bankDescription = row.description.trim() ? row.description : null;
    return {
      ...row,
      bankDescription,
      description: bankDescription
        ? cleanBankDescription(bankDescription, language).name
        : null,
    };
  });
}

async function uncategorizedImportCategory(
  db: DrizzleD1,
  householdId: string,
  type: "income" | "expense",
  cache: Map<string, { id: string; name: string }>
): Promise<{ id: string; name: string }> {
  const cached = cache.get(type);
  if (cached) return cached;
  const category = await resolveOrCreateImportCategory(
    db,
    householdId,
    "Uncategorized",
    type
  );
  const resolved = { id: category.id, name: category.name };
  cache.set(type, resolved);
  return resolved;
}

async function resolveFileImportCategory(
  db: DrizzleD1,
  householdId: string,
  rowType: "income" | "expense",
  overrideKey: string | null,
  categoryOverrides: Record<string, string | null>,
  suggestion: MerchantImportSuggestion,
  usableOverrides: Map<string, { type: "income" | "expense"; name: string }>,
  uncategorizedCache: Map<string, { id: string; name: string }>
): Promise<{ stored: { id: string; name: string }; learnCategoryId: string | null }> {
  const uncategorized = () =>
    uncategorizedImportCategory(db, householdId, rowType, uncategorizedCache);
  const hasOverride =
    overrideKey != null && Object.hasOwn(categoryOverrides, overrideKey);
  if (!hasOverride) {
    if (suggestion.categoryId && suggestion.categoryName) {
      return {
        stored: { id: suggestion.categoryId, name: suggestion.categoryName },
        learnCategoryId: suggestion.categoryId,
      };
    }
    return { stored: await uncategorized(), learnCategoryId: null };
  }
  const requested = categoryOverrides[overrideKey] ?? null;
  if (!requested) return { stored: await uncategorized(), learnCategoryId: null };
  const usable = usableOverrides.get(requested);
  if (!usable || usable.type !== rowType) {
    return { stored: await uncategorized(), learnCategoryId: null };
  }
  if (isUncategorizedCategoryName(usable.name)) {
    return { stored: { id: requested, name: usable.name }, learnCategoryId: null };
  }
  return { stored: { id: requested, name: usable.name }, learnCategoryId: requested };
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function canReadTransactionThroughSharedBudget(
  db: DrizzleD1,
  householdId: string,
  budgetId: string | null
): Promise<boolean> {
  if (!budgetId) return false;
  const sharedBudget = await db.query.budgets.findFirst({
    where: and(
      eq(budgets.id, budgetId),
      scopeToHousehold(budgets.householdId, householdId),
      isNull(budgets.userId),
      isNull(budgets.deletedAt)
    ),
  });
  return Boolean(sharedBudget);
}

async function assertCanWriteTransaction(
  db: DrizzleD1,
  session: AppSession,
  transaction: Transaction,
  action: "modify" | "delete"
) {
  if (transaction.userId === session.userId) {
    return;
  }

  if (
    await canReadTransactionThroughSharedBudget(
      db,
      session.householdId,
      transaction.budgetId
    )
  ) {
    throw new ActionError(
      `Cannot ${action} another user's transaction`,
      "PERMISSION_DENIED"
    );
  }

  throw new ActionError("Transaction not found", "NOT_FOUND");
}

const RESERVED_TXN_SPLATS = new Set(["export", "import"]);

export const handleTransactionsRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
  loadContext,
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
      "charged_amount_cents",
      "charged_currency",
      "description",
      "budget_id",
      "account_id",
      "external_id",
      "import_batch_id",
      "reviewed",
      "bank_description",
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
          csvEscape(t.chargedAmount),
          csvEscape(t.chargedCurrency),
          csvEscape(t.description),
          csvEscape(t.budgetId),
          csvEscape(t.accountId),
          csvEscape(t.externalId),
          csvEscape(t.importBatchId),
          csvEscape(t.reviewed),
          csvEscape(t.bankDescription),
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
    const { page, limit, type, reviewed, account } = parseTransactionsListQuery({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      reviewed: url.searchParams.get("reviewed") ?? undefined,
      account: url.searchParams.get("account") ?? undefined,
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

    if (reviewed !== undefined) {
      conditions.push(eq(transactions.reviewed, reviewed));
    }

    if (account) {
      conditions.push(eq(transactions.accountId, account));
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

    const body = await request.json();
    const isFileImport =
      typeof body === "object" &&
      body !== null &&
      ("ofx" in body || "csv" in body);
    const fileInput = isFileImport
      ? z
          .object({
            ofx: z.string().min(1).max(MAX_OFX_BYTES).optional(),
            csv: z.string().min(1).max(MAX_OFX_BYTES).optional(),
            sourceBank: z
              .enum(["nbc", "scotiabank", "rbc", "pcfinancial"])
              .optional(),
            currencyOverride: currencyEnum.optional(),
            repairCurrency: z.boolean().default(false),
            acceptCurrencyMismatch: z.boolean().default(false),
            duplicateConfirmationId: z.string().uuid().optional(),
            confirmedDuplicateIds: z
              .array(z.string().max(200))
              .max(2000)
              .default([]),
            accountId: z.string().min(1).max(200),
            dryRun: z.boolean().default(true),
            excludedIds: z.array(z.string().max(200)).max(2000).default([]),
            descriptions: z
              .record(
                z.string().max(200),
                z
                  .string()
                  .max(200)
                  .refine(
                    (value) => value.trim().length > 0,
                    "Description override is empty."
                  )
              )
              .default({})
              .refine(
                (overrides) => Object.keys(overrides).length <= 2000,
                "At most 2,000 description overrides."
              ),
            categories: z
              .record(z.string().max(200), z.string().uuid().nullable())
              .default({})
              .refine(
                (categories) => Object.keys(categories).length <= 2000,
                "At most 2,000 category overrides."
              ),
          })
          .refine(
            (value) => Boolean(value.ofx) !== Boolean(value.csv),
            "Provide one import file."
          )
          .refine(
            (value) =>
              !value.confirmedDuplicateIds.length ||
              Boolean(value.csv && value.duplicateConfirmationId),
            "CSV duplicate confirmation requires an ID."
          )
          .refine(
            (value) => !value.currencyOverride || Boolean(value.ofx),
            "Currency overrides require an OFX/QFX file."
          )
          .refine(
            (value) =>
              !value.repairCurrency ||
              Boolean(value.ofx && value.currencyOverride),
            "Choose a currency to correct an OFX/QFX import."
          )
          .parse(body)
      : null;
    let parsedFile: { rows: CleanImportRow[]; creditCard: boolean } | null = null;
    const excludedIds = new Set(fileInput?.excludedIds);
    let importLanguage: UiLanguage = "en";
    if (fileInput) {
      let parsed: Awaited<ReturnType<typeof parseOfx>>;
      try {
        parsed = fileInput.csv
          ? await parseWealthsimpleCsv(fileInput.csv)
          : await parseOfx(fileInput.ofx!, fileInput.sourceBank);
      } catch (error) {
        throw new ActionError(
          error instanceof Error ? error.message : "Invalid transaction file.",
          "VALIDATION_ERROR"
        );
      }
      importLanguage = (await loadViewerRegion(loadContext, request)).language;
      parsedFile = {
        creditCard: parsed.creditCard,
        rows: cleanImportRows(parsed.rows, importLanguage),
      };
    }
    let accountCurrency: CurrencyCode | undefined;
    let currencyMismatch = false;
    if (fileInput && parsedFile) {
      const account = await db.query.financialAccounts.findFirst({
        where: and(
          scopeToHousehold(financialAccounts.householdId, session!.householdId),
          eq(financialAccounts.id, fileInput.accountId),
          eq(financialAccounts.archived, false),
          isNull(financialAccounts.deletedAt),
          visibleFinancialAccountsCondition(session!.userId)
        ),
      });
      if (!account)
        throw new ActionError(
          "Unknown or inaccessible account",
          "VALIDATION_ERROR"
        );
      accountCurrency = account.currency;
      currencyMismatch = parsedFile.rows.some(
        (row) =>
          (fileInput.currencyOverride ?? row.currency) !== account.currency
      );
      if (
        !fileInput.dryRun &&
        currencyMismatch &&
        !fileInput.acceptCurrencyMismatch
      ) {
        throw new ActionError(
          "The import currency differs from the account. Confirm the currency before continuing.",
          "VALIDATION_ERROR"
        );
      }
      if (fileInput.repairCurrency) {
        const candidates = parsedFile.rows.filter(
          (row) => !excludedIds.has(row.externalId)
        );
        // Identity is externalId plus amount, date, type, and currency — not the description.
        const matches = await currencyCorrectionMatches(
          db,
          session!,
          fileInput.accountId,
          candidates.map((row) => ({ ...row, description: row.description ?? "" })),
          fileInput.currencyOverride!
        );
        if (fileInput.dryRun) {
          const eligible = new Set(matches.map((row) => row.externalId));
          return Response.json({
            ok: true,
            accountCurrency,
            currencyMismatch,
            sourceCurrencies: [
              ...new Set(parsedFile.rows.map((row) => row.currency)),
            ],
            rows: candidates.map((row) => ({
              ...row,
              currency: fileInput.currencyOverride,
              canCorrect: eligible.has(row.externalId),
              duplicate: false,
              possibleDuplicate: false,
              defaultExcluded: !eligible.has(row.externalId),
            })),
          });
        }
        const corrected = await correctImportCurrency(
          db,
          env,
          session!,
          matches,
          fileInput.currencyOverride!,
          await getHomeCurrency(db, session!.householdId)
        );
        await broadcastToHousehold(env, session!.householdId, {
          type: "TRANSACTION_UPDATE",
          action: "batch_update",
          count: corrected,
        });
        return Response.json({ ok: true, corrected });
      }
    }
    const legacy = fileInput ? null : importBodySchema.parse(body);
    const fileRows =
      parsedFile && fileInput
        ? parsedFile.rows
            .filter((row) => !excludedIds.has(row.externalId))
            .filter((row) => fileInput.dryRun || row.amountCents > 0)
            .map((row) => ({
              ...row,
              currency: fileInput.currencyOverride ?? row.currency,
              accountId: fileInput.accountId,
              budgetId: null,
            }))
        : null;
    const parsed =
      fileRows && fileInput
        ? {
            dryRun: fileInput.dryRun,
            rows: fileRows,
          }
        : {
            dryRun: legacy!.dryRun,
            rows: legacy!.rows.map((row) => ({
              ...row,
              amountCents: toCents(row.amount),
              bankDescription: null,
            })),
          };
    await validateImportBudgetAndAccountIds(
      db,
      session!.householdId,
      session!.userId,
      parsed.rows
    );
    const batchId = crypto.randomUUID();

    if (parsed.dryRun && fileRows && parsedFile) {
      const existing = new Set<string>();
      // Deliberately include tombstones: the unique import identity survives deletion.
      for (let i = 0; i < fileRows.length; i += 80) {
        const matches = await db
          .select({ externalId: transactions.externalId })
          .from(transactions)
          .where(
            and(
              scopeToHousehold(transactions.householdId, session!.householdId),
              inArray(
                transactions.externalId,
                fileRows.slice(i, i + 80).map((row) => row.externalId)
              )
            )
          );
        for (const match of matches)
          if (match.externalId) existing.add(match.externalId);
      }
      const suggestions = await suggestMerchantImportRows(
        db,
        session!.householdId,
        fileRows,
        importLanguage
      );
      const homeCurrency = await getHomeCurrency(db, session!.householdId);
      const aiStartedAt = Date.now();
      const aiRemaining = () => IMPORT_PREVIEW_AI_DEADLINE_MS - (Date.now() - aiStartedAt);
      const aiNames = await previewMerchantNames(
        env,
        db,
        session!.householdId,
        fileRows,
        suggestions,
        importLanguage,
        homeCurrency,
        Math.min(10_000, aiRemaining())
      );
      const aiCategories = await previewTransactionCategories(
        env,
        db,
        session!.householdId,
        fileRows,
        suggestions,
        aiNames,
        homeCurrency,
        aiRemaining()
      );
      const rows = fileRows.map((row, index) => {
        const suggestion = suggestions[index]!;
        const duplicate = existing.has(row.externalId!);
        existing.add(row.externalId!);
        const aiName =
          !rowSkipsAiName(row, importLanguage) &&
          suggestion.nameSource === "none" &&
          suggestion.merchantKey
            ? aiNames.get(suggestion.merchantKey)
            : undefined;
        const aiCategory = suggestion.merchantKey
          ? aiCategories.get(suggestion.merchantKey)
          : undefined;
        const suggestedCategory =
          suggestion.categorySource === "none" &&
          aiCategory &&
          aiCategory.type === row.type &&
          row.bankDescription != null &&
          !isPersonToPerson(row.bankDescription)
            ? aiCategory
            : null;
        return {
          date: row.date,
          type: row.type,
          description: aiName ?? suggestion.description,
          bankDescription: row.bankDescription,
          merchantKey: suggestion.merchantKey,
          categoryId: suggestedCategory?.categoryId ?? suggestion.categoryId,
          categorySource: suggestedCategory ? "ai" : suggestion.categorySource,
          nameSource: aiName ? "ai" : suggestion.nameSource,
          currency: row.currency,
          amountCents: row.amountCents,
          externalId: row.externalId,
          duplicate,
          possibleDuplicate: Boolean(fileInput?.csv) && duplicate,
          defaultExcluded:
            "defaultExcluded" in row
              ? row.defaultExcluded
              : row.type === "income",
        };
      });
      return Response.json({
        ok: true,
        rows,
        creditCard: parsedFile.creditCard,
        accountCurrency,
        currencyMismatch,
        sourceCurrencies: [
          ...new Set(parsedFile.rows.map((row) => row.currency)),
        ],
      });
    }
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

    const descriptionOverrides = fileInput?.descriptions ?? {};
    const categoryOverrides = fileInput?.categories ?? {};
    const fileSuggestions = fileRows
      ? await suggestMerchantImportRows(
          db,
          session!.householdId,
          fileRows,
          importLanguage
        )
      : null;
    const usableOverrides = fileSuggestions
      ? await usableAliasCategoryIds(
          db,
          session!.householdId,
          Object.values(categoryOverrides).filter((id): id is string => id != null)
        )
      : null;
    const seenInBatch = new Set<string>();
    const categoryCache = new Map<string, Awaited<ReturnType<typeof resolveOrCreateImportCategory>>>();
    const uncategorizedCache = new Map<string, { id: string; name: string }>();
    const values = [];
    const lessons: {
      id: string;
      merchantKey: string;
      row: MerchantLessonRow;
    }[] = [];
    for (let index = 0; index < parsed.rows.length; index++) {
      const row = parsed.rows[index]!;
      let externalId = row.externalId?.trim() || null;
      const overrideKey = externalId;
      const suggestion = fileSuggestions?.[index];
      const nameOverride =
        overrideKey != null && Object.hasOwn(descriptionOverrides, overrideKey)
          ? descriptionOverrides[overrideKey]!.trim()
          : null;
      const description =
        nameOverride || suggestion?.description || row.description?.trim() || null;
      if (externalId && fileInput?.csv && fileInput.confirmedDuplicateIds.includes(externalId)) {
        externalId = `${externalId}:repeat:${fileInput.duplicateConfirmationId}`;
      }
      if (externalId) {
        if (seenInBatch.has(externalId)) {
          continue;
        }
        seenInBatch.add(externalId);
      }
      const currency = (row.currency ?? homeCurrency) as CurrencyCode;
      let category: { id: string; name: string };
      let learnCategoryId: string | null = null;
      if (suggestion) {
        const resolved = await resolveFileImportCategory(
          db,
          session!.householdId,
          row.type,
          overrideKey,
          categoryOverrides,
          suggestion,
          usableOverrides ?? new Map(),
          uncategorizedCache
        );
        category = resolved.stored;
        learnCategoryId = resolved.learnCategoryId;
      } else {
        const cacheKey = `${row.type}:${row.category.trim().toLowerCase()}`;
        let resolved = categoryCache.get(cacheKey);
        if (!resolved) {
          resolved = await resolveOrCreateImportCategory(
            db,
            session!.householdId,
            row.category,
            row.type
          );
          categoryCache.set(cacheKey, resolved);
        }
        category = resolved;
      }
      const id = crypto.randomUUID();
      if (suggestion?.merchantKey) {
        lessons.push({
          id,
          merchantKey: suggestion.merchantKey,
          row: {
            suggestedName: suggestion.description,
            chosenName: nameOverride ?? suggestion.description,
            suggestedCategoryId: suggestion.categoryId,
            chosenCategoryId: learnCategoryId,
          },
        });
      }
      values.push({
        id,
        householdId: session!.householdId,
        userId: session!.userId,
        amount: row.amountCents,
        currency,
        exchangeRateToHome: rateByCurrency.get(currency) ?? null,
        description,
        bankDescription: row.bankDescription,
        categoryId: category.id,
        category: category.name,
        type: row.type,
        date: row.date.split("T")[0]!,
        budgetId: row.budgetId ?? null,
        accountId: row.accountId ?? null,
        importBatchId: batchId,
        externalId,
      });
    }

    // Leave room for generated timestamp/default bindings under D1's 100-variable limit.
    const IMPORT_CHUNK_SIZE = 4;
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
    let learned = 0;
    if (lessons.length > 0) {
      const storedIds = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            scopeToHousehold(transactions.householdId, session!.householdId),
            eq(transactions.importBatchId, batchId)
          )
        );
      const insertedIds = new Set(storedIds.map((row) => row.id));
      const groups = new Map<string, MerchantLessonRow[]>();
      for (const lesson of lessons) {
        if (!insertedIds.has(lesson.id)) continue;
        const group = groups.get(lesson.merchantKey) ?? [];
        group.push(lesson.row);
        groups.set(lesson.merchantKey, group);
      }
      for (const [merchantKey, rows] of groups) {
        const patch = lessonForMerchant(rows);
        if (!patch) continue;
        // The rows are already in; a failed lesson must not fail the import.
        try {
          await upsertUserAlias(db, session!.householdId, merchantKey, patch);
          learned += 1;
        } catch {
          logMerchantAliasFailure();
        }
      }
    }

    await broadcastToHousehold(env, session!.householdId, {
      type: "TRANSACTION_UPDATE",
      action: "batch_create",
      count: inserted,
    });

    return Response.json(
      { ok: true, inserted, skipped, batchId, learned },
      { status: 201 }
    );
  }

  if (request.method === "POST" && !id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:transactions:add`,
      ROUTE_RATE_LIMITS.transactions.create
    );

    const validated = addTransactionSchema.parse(await request.json());
    const reminderTimes = validated.reminderTimes ?? [];
    assertFutureReminders(reminderTimes);
    const category = await assertSelectableFinancialCategory(
      db,
      session!.householdId,
      validated.categoryId,
      validated.type
    );
    await validateFinancialRefs(db, session!.householdId, session!.userId, {
      budgetId: validated.budgetId,
      accountId: validated.accountId,
    });
    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const currency = validated.currency ?? homeCurrency;
    const charge =
      validated.chargedAmount != null
        ? await resolveCharge(
            env,
            homeCurrency,
            currency,
            validated.chargedAmount,
            validated.chargedCurrency ?? homeCurrency
          )
        : CLEARED_CHARGE;
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
            ...charge,
            description: validated.description?.trim() || null,
            categoryId: category.id,
            category: category.name,
            type: validated.type,
            date: validated.date,
            budgetId: validated.budgetId || null,
            accountId: validated.accountId || null,
            reminderTimes,
            reminderUserId: reminderTimes.length > 0 ? session!.userId : null,
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
    const existing = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.id, id),
        scopeToHousehold(transactions.householdId, session!.householdId),
        isNull(transactions.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Transaction not found", "NOT_FOUND");
    }

    await validateFinancialRefs(
      db,
      session!.householdId,
      session!.userId,
      refsChangedFromExisting(validated, existing)
    );
    const updateData: Record<string, unknown> = {};

    if (validated.reminderTimes !== undefined) {
      assertFutureReminders(validated.reminderTimes, existing.reminderTimes);
      updateData.reminderTimes = validated.reminderTimes;
      if (JSON.stringify(validated.reminderTimes) !== JSON.stringify(existing.reminderTimes)) {
        updateData.reminderUserId = validated.reminderTimes.length > 0 ? session!.userId : null;
      }
    }

    if (validated.amount !== undefined) {
      updateData.amount = toCents(validated.amount);
    }
    if (validated.description !== undefined) {
      updateData.description = validated.description?.trim() || null;
    }
    if (validated.categoryId !== undefined) {
      const nextType = validated.type ?? existing.type;
      const categoryUnchanged =
        validated.categoryId === existing.categoryId && nextType === existing.type;
      if (categoryUnchanged) {
        updateData.categoryId = existing.categoryId;
        updateData.category = existing.category;
      } else {
        const category = await assertSelectableFinancialCategory(
          db,
          session!.householdId,
          validated.categoryId,
          nextType
        );
        updateData.categoryId = category.id;
        updateData.category = category.name;
      }
    }
    if (validated.type !== undefined) {
      if (validated.type !== existing.type) {
        if (validated.categoryId === undefined) {
          if (!existing.categoryId) {
            throw new ActionError(
              "categoryId is required when changing transaction type",
              "VALIDATION_ERROR"
            );
          }
          await assertSelectableFinancialCategory(
            db,
            session!.householdId,
            existing.categoryId,
            validated.type
          );
        }
      }
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
    // The edit form resends the currency; only a real change takes a new FX
    // snapshot, so the row's market rate (and a charge's fee) stays put.
    const currencyChanged =
      validated.currency !== undefined && validated.currency !== existing.currency;
    if (currencyChanged || validated.chargedAmount != null) {
      const homeCurrency = await getHomeCurrency(db, session!.householdId);
      if (validated.currency !== undefined && currencyChanged) {
        updateData.currency = validated.currency;
        updateData.exchangeRateToHome = await getExchangeRateForRecord(
          env,
          validated.currency,
          homeCurrency
        );
      }
      if (validated.chargedAmount != null) {
        const nextCurrency = validated.currency ?? existing.currency;
        const chargedCurrency =
          validated.chargedCurrency ?? existing.chargedCurrency ?? homeCurrency;
        if (
          validated.chargedAmount === existing.chargedAmount &&
          chargedCurrency === existing.chargedCurrency
        ) {
          // Same charge resent (the edit form always sends it): keep its FX snapshot.
          assertChargeCurrencyDiffers(chargedCurrency, nextCurrency);
        } else {
          Object.assign(
            updateData,
            await resolveCharge(
              env,
              homeCurrency,
              nextCurrency,
              validated.chargedAmount,
              chargedCurrency
            )
          );
        }
      }
    }
    if (
      validated.chargedAmount === null ||
      (validated.chargedAmount === undefined &&
        (currencyChanged ||
          (validated.amount !== undefined &&
            toCents(validated.amount) !== existing.amount)))
    ) {
      // A recorded charge belongs to the amount and currency it was entered
      // for; editing either without a new one falls back to the market rate.
      Object.assign(updateData, CLEARED_CHARGE);
    }
    if (validated.reviewed !== undefined) {
      updateData.reviewed = validated.reviewed;
    }

    await assertCanWriteTransaction(db, session!, existing, "modify");

    // A charge was checked against the amount and currency read above; only
    // write it if a concurrent edit hasn't changed them since.
    const chargeGuards =
      validated.chargedAmount != null
        ? [
            eq(transactions.currency, existing.currency),
            eq(transactions.amount, existing.amount),
          ]
        : [];

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
              ...chargeGuards
            )
          )
          .returning()
          .get()
    );

    if (!updated) {
      if (chargeGuards.length > 0) {
        const current = await db.query.transactions.findFirst({
          where: and(
            eq(transactions.id, id),
            scopeToHousehold(transactions.householdId, session!.householdId),
            isNull(transactions.deletedAt)
          ),
        });
        if (current) {
          throw new ActionError(
            "Transaction was modified concurrently; try again",
            "CONFLICT"
          );
        }
      }
      throw new ActionError("Transaction not found", "NOT_FOUND");
    }

    if (existing.bankDescription) {
      try {
        const language = (await loadViewerRegion(loadContext, request)).language;
        await learnMerchantAliasFromEdit(db, session!.householdId, {
          bankDescription: existing.bankDescription,
          language,
          previousDescription: existing.description,
          nextDescription: updated.description,
          descriptionProvided: validated.description !== undefined,
          previousCategoryId: existing.categoryId,
          nextCategoryId: updated.categoryId,
          nextCategoryName: updated.category,
          categoryProvided: validated.categoryId !== undefined,
        });
      } catch {
        logMerchantAliasFailure();
      }
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

    const existing = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.id, id),
        scopeToHousehold(transactions.householdId, session!.householdId),
        isNull(transactions.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Transaction not found", "NOT_FOUND");
    }
    await assertCanWriteTransaction(db, session!, existing, "delete");

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
          // Keep externalId so a deleted import is not re-imported by an overlapping download.
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(transactions.id, id),
              scopeToHousehold(transactions.householdId, session!.householdId),
              isNull(transactions.deletedAt)
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
