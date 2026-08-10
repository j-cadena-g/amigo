import {
  and,
  assets,
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
import { ActionError, logSecurityEvent } from "../lib/errors";
import { getExchangeRateForRecord } from "../lib/exchange-rates";
import { assertPermission, canManageSharedItems } from "../lib/permissions";
import {
  isExplicitAdminTakeover,
  resolveFinancialObjectUserId,
} from "../lib/financial-object-permissions";
import { toCents } from "../lib/conversions";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatSegments, type ApiHandler } from "./route";
import { getHomeCurrency } from "../lib/household-currency";
import { insertManyAuditLogs, withAudit } from "../lib/audit";
import { zCurrencyCode } from "../lib/request-validation";
import {
  convertedAccountIdForAsset,
  isLegacyAssetType,
  mapLegacyAssetTypeToAccountType,
} from "../lib/legacy-asset-migration";

const zAccountType = z.enum(FINANCIAL_ACCOUNT_TYPES);

const createAssetSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["BANK", "INVESTMENT", "CASH", "PROPERTY"]),
  balance: z.number(),
  currency: zCurrencyCode.optional(),
  isShared: z.boolean().optional().default(false),
  adminTakeover: z.boolean().optional(),
});

const updateAssetSchema = createAssetSchema.extend({
  isShared: z.boolean().optional(),
});

const convertAssetSchema = z
  .object({
    accountType: zAccountType.optional(),
    name: z.string().min(1).optional(),
    balance: z.number().optional(),
    currency: zCurrencyCode.optional(),
    isShared: z.boolean().optional(),
  })
  .strict();

function assertCanMutateAsset(
  session: NonNullable<Parameters<ApiHandler>[0]["session"]>,
  existing: { userId: string | null },
  action: "delete" | "convert"
) {
  const isShared = existing.userId === null;
  if (isShared) {
    assertPermission(
      canManageSharedItems(session),
      `Only owners and admins can ${action} shared assets`
    );
  } else if (existing.userId !== session.userId) {
    throw new ActionError(
      `Cannot ${action} another user's personal asset`,
      "PERMISSION_DENIED"
    );
  }
}

export const handleAssetsRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const [id, action] = getSplatSegments(params);
  const db = getDb(env.DB);

  if (request.method === "GET" && !id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:assets:list`,
      ROUTE_RATE_LIMITS.assets.list
    );

    const userAssets = await db.query.assets.findMany({
      where: and(
        scopeToHousehold(assets.householdId, session!.householdId),
        or(eq(assets.userId, session!.userId), isNull(assets.userId)),
        isNull(assets.deletedAt)
      ),
      orderBy: (asset, { desc }) => [desc(asset.createdAt)],
    });

    return Response.json(
      userAssets.map((asset) => ({ ...asset, isShared: asset.userId === null }))
    );
  }

  if (request.method === "POST" && !id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:assets:create`,
      ROUTE_RATE_LIMITS.assets.create
    );

    const validated = createAssetSchema.parse(await request.json());
    if (validated.isShared) {
      assertPermission(
        canManageSharedItems(session!),
        "Only owners and admins can create shared assets"
      );
    }

    const currency = validated.currency ?? "CAD";
    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const exchangeRateToHome = await getExchangeRateForRecord(
      env,
      currency,
      homeCurrency
    );

    const assetId = crypto.randomUUID();
    const asset = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "assets",
        recordId: assetId,
        operation: "INSERT",
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .insert(assets)
          .values({
            id: assetId,
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

    return Response.json(asset, { status: 201 });
  }

  if (request.method === "POST" && id && action === "convert") {
    await enforceRateLimit(
      env,
      `${session!.userId}:assets:convert`,
      ROUTE_RATE_LIMITS.assets.convert
    );

    const validated = convertAssetSchema.parse(await request.json().catch(() => ({})));
    const existing = await db.query.assets.findFirst({
      where: and(
        eq(assets.id, id),
        scopeToHousehold(assets.householdId, session!.householdId)
      ),
    });

    if (!existing) {
      throw new ActionError("Asset not found", "NOT_FOUND");
    }

    assertCanMutateAsset(session!, existing, "convert");

    const accountId = convertedAccountIdForAsset(existing.id);
    // Include soft-deleted rows so reconversion cannot collide on the deterministic id.
    const existingAccount = await db.query.financialAccounts.findFirst({
      where: and(
        eq(financialAccounts.id, accountId),
        scopeToHousehold(financialAccounts.householdId, session!.householdId)
      ),
    });

    // Idempotent retry: conversion already completed.
    if (existing.deletedAt) {
      if (!existingAccount || existingAccount.deletedAt) {
        throw new ActionError(
          "Asset was deleted and cannot be converted",
          "VALIDATION_ERROR"
        );
      }
      return Response.json({
        account: { ...existingAccount, isShared: existingAccount.userId === null },
        asset: { ...existing, isShared: existing.userId === null },
      });
    }

    if (existingAccount?.deletedAt) {
      throw new ActionError(
        "A converted account for this asset already exists and was deleted. Restore it instead of converting again.",
        "VALIDATION_ERROR"
      );
    }

    // Repair path: account exists but asset delete never landed.
    if (existingAccount) {
      const deletedAt = new Date();
      const deletedAsset = await withAudit(
        db,
        {
          householdId: session!.householdId,
          tableName: "assets",
          recordId: id,
          operation: "DELETE",
          oldValues: existing,
          changedBy: session!.userId,
        },
        async () =>
          db
            .update(assets)
            .set({ deletedAt })
            .where(
              and(
                eq(assets.id, id),
                scopeToHousehold(assets.householdId, session!.householdId),
                isNull(assets.deletedAt)
              )
            )
            .returning()
            .get()
      );

      return Response.json({
        account: {
          ...existingAccount,
          isShared: existingAccount.userId === null,
        },
        asset: {
          ...(deletedAsset ?? { ...existing, deletedAt }),
          isShared: existing.userId === null,
        },
      });
    }

    if (!isLegacyAssetType(existing.type)) {
      throw new ActionError("Unsupported legacy asset type", "VALIDATION_ERROR");
    }

    const defaultType = mapLegacyAssetTypeToAccountType(existing.type);
    const accountType = validated.accountType ?? defaultType;
    if (existing.type !== "BANK" && accountType !== defaultType) {
      throw new ActionError(
        `Legacy ${existing.type} assets convert to ${defaultType}`,
        "VALIDATION_ERROR"
      );
    }
    if (
      existing.type === "BANK" &&
      accountType !== "CHECKING" &&
      accountType !== "SAVINGS"
    ) {
      throw new ActionError(
        "BANK assets convert to CHECKING or SAVINGS",
        "VALIDATION_ERROR"
      );
    }

    const isShared = validated.isShared ?? existing.userId === null;
    if (isShared) {
      assertPermission(
        canManageSharedItems(session!),
        "Only owners and admins can create shared accounts"
      );
    }

    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const currency = (validated.currency ?? existing.currency ?? homeCurrency) as CurrencyCode;
    const exchangeRateToHome = await getExchangeRateForRecord(
      env,
      currency,
      homeCurrency
    );
    const balanceCents =
      validated.balance !== undefined
        ? toCents(validated.balance)
        : existing.balance;
    const name = (validated.name ?? existing.name).trim();
    const userId = isShared ? null : (existing.userId ?? session!.userId);
    const deletedAt = new Date();
    const now = new Date();

    const accountValues = {
      id: accountId,
      householdId: session!.householdId,
      userId,
      name,
      type: accountType,
      balance: balanceCents,
      currency,
      exchangeRateToHome,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };

    const [insertedAccounts, deletedAssets] = await db.batch([
      db
        .insert(financialAccounts)
        .values(accountValues)
        .onConflictDoNothing()
        .returning(),
      db
        .update(assets)
        .set({ deletedAt })
        .where(
          and(
            eq(assets.id, id),
            scopeToHousehold(assets.householdId, session!.householdId),
            isNull(assets.deletedAt)
          )
        )
        .returning(),
    ]);

    const insertedAccount = insertedAccounts[0];
    const deletedAsset = deletedAssets[0];

    // Concurrent convert: another request won the insert.
    if (!insertedAccount) {
      const racedAccount = await db.query.financialAccounts.findFirst({
        where: and(
          eq(financialAccounts.id, accountId),
          scopeToHousehold(financialAccounts.householdId, session!.householdId),
          isNull(financialAccounts.deletedAt)
        ),
      });
      if (!racedAccount) {
        // Batch already committed. Undo our soft-delete so the asset is not lost.
        if (deletedAsset) {
          await db
            .update(assets)
            .set({ deletedAt: null })
            .where(
              and(
                eq(assets.id, id),
                scopeToHousehold(assets.householdId, session!.householdId)
              )
            );
        }
        throw new ActionError("Converted account not found", "NOT_FOUND");
      }

      // If we soft-deleted the asset in this batch, audit only that delete.
      if (deletedAsset) {
        await insertManyAuditLogs(db, [
          {
            householdId: session!.householdId,
            tableName: "assets",
            recordId: id,
            operation: "DELETE",
            oldValues: existing,
            changedBy: session!.userId,
          },
        ]);
      }

      return Response.json({
        account: { ...racedAccount, isShared: racedAccount.userId === null },
        asset: {
          ...(deletedAsset ?? { ...existing, deletedAt: existing.deletedAt ?? deletedAt }),
          isShared: existing.userId === null,
        },
      });
    }

    await insertManyAuditLogs(db, [
      {
        householdId: session!.householdId,
        tableName: "financial_accounts",
        recordId: accountId,
        operation: "INSERT",
        newValues: insertedAccount,
        changedBy: session!.userId,
      },
      {
        householdId: session!.householdId,
        tableName: "assets",
        recordId: id,
        operation: "DELETE",
        oldValues: existing,
        changedBy: session!.userId,
      },
    ]);

    return Response.json(
      {
        account: { ...insertedAccount, isShared: insertedAccount.userId === null },
        asset: {
          ...(deletedAsset ?? { ...existing, deletedAt }),
          isShared: existing.userId === null,
        },
      },
      { status: 201 }
    );
  }

  if (request.method === "PATCH" && id && !action) {
    await enforceRateLimit(
      env,
      `${session!.userId}:assets:update`,
      ROUTE_RATE_LIMITS.assets.update
    );

    const validated = updateAssetSchema.parse(await request.json());
    const existing = await db.query.assets.findFirst({
      where: and(
        eq(assets.id, id),
        scopeToHousehold(assets.householdId, session!.householdId),
        isNull(assets.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Asset not found", "NOT_FOUND");
    }

    const nextUserId = resolveFinancialObjectUserId({
      session: session!,
      existingUserId: existing.userId,
      requestedIsShared: validated.isShared,
      adminTakeover: validated.adminTakeover,
      canManageShared: canManageSharedItems(session!),
      objectName: "asset",
    });
    const adminTakeover = isExplicitAdminTakeover({
      session: session!,
      existingUserId: existing.userId,
      requestedIsShared: validated.isShared,
      adminTakeover: validated.adminTakeover,
    });

    const currency = validated.currency ?? "CAD";
    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const exchangeRateToHome = await getExchangeRateForRecord(
      env,
      currency,
      homeCurrency
    );

    const updated = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "assets",
        recordId: id,
        operation: "UPDATE",
        oldValues: existing,
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(assets)
          .set({
            userId: nextUserId,
            name: validated.name.trim(),
            type: validated.type,
            balance: toCents(validated.balance),
            currency,
            exchangeRateToHome,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(assets.id, id),
              scopeToHousehold(assets.householdId, session!.householdId)
            )
          )
          .returning()
          .get()
    );

    if (!updated) {
      throw new ActionError("Asset not found", "NOT_FOUND");
    }

    if (adminTakeover) {
      logSecurityEvent("personal_financial_object_takeover", {
        tableName: "assets",
        recordId: id,
        previousUserId: existing.userId,
        changedBy: session!.userId,
        householdId: session!.householdId,
      });
    }

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id && !action) {
    await enforceRateLimit(
      env,
      `${session!.userId}:assets:delete`,
      ROUTE_RATE_LIMITS.assets.delete
    );

    const existing = await db.query.assets.findFirst({
      where: and(
        eq(assets.id, id),
        scopeToHousehold(assets.householdId, session!.householdId),
        isNull(assets.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Asset not found", "NOT_FOUND");
    }

    assertCanMutateAsset(session!, existing, "delete");

    const deleted = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "assets",
        recordId: id,
        operation: "DELETE",
        oldValues: existing,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(assets)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(assets.id, id),
              scopeToHousehold(assets.householdId, session!.householdId)
            )
          )
          .returning()
          .get()
    );

    if (!deleted) {
      throw new ActionError("Asset not found", "NOT_FOUND");
    }

    return Response.json(deleted);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
