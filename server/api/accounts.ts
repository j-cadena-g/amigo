import {
  and,
  CURRENCY_CODES,
  eq,
  financialAccounts,
  FINANCIAL_ACCOUNT_TYPES,
  getDb,
  isNull,
  or,
  scopeToHousehold,
} from "@amigo/db";
import type { CurrencyCode } from "@amigo/db";
import { z } from "zod";
import { ActionError } from "../lib/errors";
import { assertPermission, canManageSharedItems } from "../lib/permissions";
import { toCents } from "../lib/conversions";
import { getExchangeRateForRecord } from "../lib/exchange-rates";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatSegments, type ApiHandler } from "./route";
import { getHomeCurrency } from "../lib/household-currency";
import { withAudit } from "../lib/audit";

const zCurrencyCode = z.enum(
  CURRENCY_CODES as unknown as [CurrencyCode, ...CurrencyCode[]]
);
const zAccountType = z.enum(
  FINANCIAL_ACCOUNT_TYPES as unknown as [
    (typeof FINANCIAL_ACCOUNT_TYPES)[number],
    ...(typeof FINANCIAL_ACCOUNT_TYPES)[number][],
  ]
);

const createAccountSchema = z.object({
  name: z.string().min(1),
  type: zAccountType,
  balance: z.number(),
  currency: zCurrencyCode.optional(),
  isShared: z.boolean().optional().default(false),
  archived: z.boolean().optional(),
});

const updateAccountSchema = z.object({
  name: z.string().min(1),
  type: zAccountType,
  balance: z.number(),
  currency: zCurrencyCode.optional(),
  isShared: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const handleAccountsRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const [id] = getSplatSegments(params);
  const db = getDb(env.DB);

  if (request.method === "GET" && !id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:accounts:list`,
      ROUTE_RATE_LIMITS.accounts.list
    );

    const rows = await db.query.financialAccounts.findMany({
      where: and(
        scopeToHousehold(financialAccounts.householdId, session!.householdId),
        or(eq(financialAccounts.userId, session!.userId), isNull(financialAccounts.userId)),
        isNull(financialAccounts.deletedAt),
        eq(financialAccounts.archived, false)
      ),
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    });

    return Response.json(
      rows.map((a) => ({ ...a, isShared: a.userId === null }))
    );
  }

  if (request.method === "POST" && !id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:accounts:create`,
      ROUTE_RATE_LIMITS.accounts.create
    );

    const validated = createAccountSchema.parse(await request.json());
    if (validated.isShared) {
      assertPermission(
        canManageSharedItems(session!),
        "Only owners and admins can create shared accounts"
      );
    }

    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const currency = (validated.currency ?? homeCurrency) as CurrencyCode;
    const exchangeRateToHome = await getExchangeRateForRecord(env, currency, homeCurrency);

    const accountId = crypto.randomUUID();
    const row = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "financial_accounts",
        recordId: accountId,
        operation: "INSERT",
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .insert(financialAccounts)
          .values({
            id: accountId,
            householdId: session!.householdId,
            userId: validated.isShared ? null : session!.userId,
            name: validated.name.trim(),
            type: validated.type,
            balance: toCents(validated.balance),
            currency,
            exchangeRateToHome,
          })
          .returning()
          .get()
    );

    return Response.json(row, { status: 201 });
  }

  if (request.method === "PATCH" && id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:accounts:update`,
      ROUTE_RATE_LIMITS.accounts.update
    );

    const validated = updateAccountSchema.parse(await request.json());
    const existing = await db.query.financialAccounts.findFirst({
      where: and(
        eq(financialAccounts.id, id),
        scopeToHousehold(financialAccounts.householdId, session!.householdId),
        isNull(financialAccounts.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Account not found", "NOT_FOUND");
    }

    const isCurrentlyShared = existing.userId === null;
    if (isCurrentlyShared || validated.isShared === true) {
      assertPermission(
        canManageSharedItems(session!),
        "Only owners and admins can modify shared accounts"
      );
    } else if (existing.userId !== session!.userId) {
      throw new ActionError(
        "Cannot modify another user's personal account",
        "PERMISSION_DENIED"
      );
    }

    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const currency = (validated.currency ?? homeCurrency) as CurrencyCode;
    const exchangeRateToHome = await getExchangeRateForRecord(env, currency, homeCurrency);

    const updated = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "financial_accounts",
        recordId: id,
        operation: "UPDATE",
        oldValues: existing,
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(financialAccounts)
          .set({
            userId:
              validated.isShared === undefined
                ? existing.userId
                : validated.isShared
                  ? null
                  : session!.userId,
            name: validated.name.trim(),
            type: validated.type,
            balance: toCents(validated.balance),
            currency,
            exchangeRateToHome,
            ...(validated.archived !== undefined ? { archived: validated.archived } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(financialAccounts.id, id),
              scopeToHousehold(financialAccounts.householdId, session!.householdId)
            )
          )
          .returning()
          .get()
    );

    if (!updated) {
      throw new ActionError("Account not found", "NOT_FOUND");
    }

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:accounts:delete`,
      ROUTE_RATE_LIMITS.accounts.delete
    );

    const existing = await db.query.financialAccounts.findFirst({
      where: and(
        eq(financialAccounts.id, id),
        scopeToHousehold(financialAccounts.householdId, session!.householdId),
        isNull(financialAccounts.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Account not found", "NOT_FOUND");
    }

    const isShared = existing.userId === null;
    if (isShared) {
      assertPermission(
        canManageSharedItems(session!),
        "Only owners and admins can delete shared accounts"
      );
    } else if (existing.userId !== session!.userId) {
      throw new ActionError(
        "Cannot delete another user's personal account",
        "PERMISSION_DENIED"
      );
    }

    const deleted = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "financial_accounts",
        recordId: id,
        operation: "DELETE",
        oldValues: existing,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(financialAccounts)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(financialAccounts.id, id),
              scopeToHousehold(financialAccounts.householdId, session!.householdId)
            )
          )
          .returning()
          .get()
    );

    if (!deleted) {
      throw new ActionError("Account not found", "NOT_FOUND");
    }

    return Response.json(deleted);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
