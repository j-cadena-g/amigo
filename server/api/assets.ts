import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../env";
import { getDb, assets, households, scopeToHousehold, eq, and, or, isNull } from "@amigo/db";
import { ActionError } from "../lib/errors";
import { assertPermission, canManageSharedItems } from "../lib/permissions";
import { toCents } from "../lib/conversions";
import { getExchangeRateForRecord } from "../lib/exchange-rates";
import type { CurrencyCode } from "@amigo/db";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";

const assetSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["BANK", "INVESTMENT", "CASH", "PROPERTY"]),
  balance: z.number(),
  currency: z.enum(["CAD", "USD", "EUR", "GBP", "MXN"]).optional(),
  isShared: z.boolean().optional().default(false),
});

export const assetsRoute = new Hono<HonoEnv>();

async function getHomeCurrency(db: ReturnType<typeof getDb>, householdId: string): Promise<CurrencyCode> {
  const household = await db.query.households.findFirst({
    where: eq(households.id, householdId),
  });
  return (household?.homeCurrency as CurrencyCode) ?? "CAD";
}

// List assets
assetsRoute.get("/", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:assets:list`,
    ROUTE_RATE_LIMITS.assets.list
  );
  const db = getDb(c.env.DB);

  const userAssets = await db.query.assets.findMany({
    where: and(
      scopeToHousehold(assets.householdId, session.householdId),
      or(eq(assets.userId, session.userId), isNull(assets.userId)),
      isNull(assets.deletedAt)
    ),
    orderBy: (assets, { desc }) => [desc(assets.createdAt)],
  });

  return c.json(userAssets.map(a => ({ ...a, isShared: a.userId === null })));
});

// Create asset
assetsRoute.post("/", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:assets:create`,
    ROUTE_RATE_LIMITS.assets.create
  );
  const body = await c.req.json();
  const validated = assetSchema.parse(body);
  const db = getDb(c.env.DB);

  if (validated.isShared) {
    assertPermission(canManageSharedItems(session), "Only owners and admins can create shared assets");
  }

  const currency = validated.currency ?? "CAD";
  const homeCurrency = await getHomeCurrency(db, session.householdId);
  const exchangeRateToHome = await getExchangeRateForRecord(c.env, currency, homeCurrency);

  const asset = await db
    .insert(assets)
    .values({
      householdId: session.householdId,
      userId: validated.isShared ? null : session.userId,
      name: validated.name.trim(),
      type: validated.type,
      balance: toCents(validated.balance),
      currency,
      exchangeRateToHome,
    })
    .returning()
    .get();

  return c.json(asset, 201);
});

// Update asset
assetsRoute.patch("/:id", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:assets:update`,
    ROUTE_RATE_LIMITS.assets.update
  );
  const id = c.req.param("id");
  const body = await c.req.json();
  const validated = assetSchema.parse(body);
  const db = getDb(c.env.DB);

  const existing = await db.query.assets.findFirst({
    where: and(
      eq(assets.id, id),
      scopeToHousehold(assets.householdId, session.householdId),
      isNull(assets.deletedAt)
    ),
  });

  if (!existing) {
    throw new ActionError("Asset not found", "NOT_FOUND");
  }

  const isCurrentlyShared = existing.userId === null;
  if (isCurrentlyShared || validated.isShared) {
    assertPermission(canManageSharedItems(session), "Only owners and admins can modify shared assets");
  } else if (existing.userId !== session.userId) {
    throw new ActionError("Cannot modify another user's personal asset", "PERMISSION_DENIED");
  }

  const currency = validated.currency ?? "CAD";
  const homeCurrency = await getHomeCurrency(db, session.householdId);
  const exchangeRateToHome = await getExchangeRateForRecord(c.env, currency, homeCurrency);

  const updated = await db
    .update(assets)
    .set({
      userId: validated.isShared ? null : session.userId,
      name: validated.name.trim(),
      type: validated.type,
      balance: toCents(validated.balance),
      currency,
      exchangeRateToHome,
      updatedAt: new Date(),
    })
    .where(and(eq(assets.id, id), scopeToHousehold(assets.householdId, session.householdId)))
    .returning()
    .get();

  if (!updated) {
    throw new ActionError("Asset not found", "NOT_FOUND");
  }

  return c.json(updated);
});

// Delete asset (soft)
assetsRoute.delete("/:id", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:assets:delete`,
    ROUTE_RATE_LIMITS.assets.delete
  );
  const id = c.req.param("id");
  const db = getDb(c.env.DB);

  const existing = await db.query.assets.findFirst({
    where: and(
      eq(assets.id, id),
      scopeToHousehold(assets.householdId, session.householdId),
      isNull(assets.deletedAt)
    ),
  });

  if (!existing) {
    throw new ActionError("Asset not found", "NOT_FOUND");
  }

  const isShared = existing.userId === null;
  if (isShared) {
    assertPermission(canManageSharedItems(session), "Only owners and admins can delete shared assets");
  } else if (existing.userId !== session.userId) {
    throw new ActionError("Cannot delete another user's personal asset", "PERMISSION_DENIED");
  }

  const deleted = await db
    .update(assets)
    .set({ deletedAt: new Date() })
    .where(and(eq(assets.id, id), scopeToHousehold(assets.householdId, session.householdId)))
    .returning()
    .get();

  if (!deleted) {
    throw new ActionError("Asset not found", "NOT_FOUND");
  }

  return c.json(deleted);
});
