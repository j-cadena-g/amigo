import {
  and,
  assets,
  eq,
  getDb,
  households,
  isNull,
  or,
  scopeToHousehold,
} from "@amigo/db";
import type { CurrencyCode } from "@amigo/db";
import { z } from "zod";
import { ActionError } from "../lib/errors";
import { getExchangeRateForRecord } from "../lib/exchange-rates";
import { assertPermission, canManageSharedItems } from "../lib/permissions";
import { toCents } from "../lib/conversions";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatSegments, type ApiHandler } from "./route";

const assetSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["BANK", "INVESTMENT", "CASH", "PROPERTY"]),
  balance: z.number(),
  currency: z.enum(["CAD", "USD", "EUR", "GBP", "MXN"]).optional(),
  isShared: z.boolean().optional().default(false),
});

async function getHomeCurrency(
  db: ReturnType<typeof getDb>,
  householdId: string
): Promise<CurrencyCode> {
  const household = await db.query.households.findFirst({
    where: eq(households.id, householdId),
  });
  return (household?.homeCurrency as CurrencyCode) ?? "CAD";
}

export const handleAssetsRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const [id] = getSplatSegments(params);
  const db = getDb(env.DB);

  if (request.method === "GET" && !id) {
    await enforceRateLimit(
      env.CACHE,
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
      env.CACHE,
      `${session!.userId}:assets:create`,
      ROUTE_RATE_LIMITS.assets.create
    );

    const validated = assetSchema.parse(await request.json());
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

    const asset = await db
      .insert(assets)
      .values({
        householdId: session!.householdId,
        userId: validated.isShared ? null : session!.userId,
        name: validated.name.trim(),
        type: validated.type,
        balance: toCents(validated.balance),
        currency,
        exchangeRateToHome,
      })
      .returning()
      .get();

    return Response.json(asset, { status: 201 });
  }

  if (request.method === "PATCH" && id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:assets:update`,
      ROUTE_RATE_LIMITS.assets.update
    );

    const validated = assetSchema.parse(await request.json());
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

    const isCurrentlyShared = existing.userId === null;
    if (isCurrentlyShared || validated.isShared) {
      assertPermission(
        canManageSharedItems(session!),
        "Only owners and admins can modify shared assets"
      );
    } else if (existing.userId !== session!.userId) {
      throw new ActionError(
        "Cannot modify another user's personal asset",
        "PERMISSION_DENIED"
      );
    }

    const currency = validated.currency ?? "CAD";
    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const exchangeRateToHome = await getExchangeRateForRecord(
      env,
      currency,
      homeCurrency
    );

    const updated = await db
      .update(assets)
      .set({
        userId: validated.isShared ? null : session!.userId,
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
      .get();

    if (!updated) {
      throw new ActionError("Asset not found", "NOT_FOUND");
    }

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id) {
    await enforceRateLimit(
      env.CACHE,
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

    const isShared = existing.userId === null;
    if (isShared) {
      assertPermission(
        canManageSharedItems(session!),
        "Only owners and admins can delete shared assets"
      );
    } else if (existing.userId !== session!.userId) {
      throw new ActionError(
        "Cannot delete another user's personal asset",
        "PERMISSION_DENIED"
      );
    }

    const deleted = await db
      .update(assets)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(assets.id, id),
          scopeToHousehold(assets.householdId, session!.householdId)
        )
      )
      .returning()
      .get();

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
