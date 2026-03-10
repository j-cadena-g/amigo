import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../env";
import { getDb, assets, households, scopeToHousehold, eq, and, isNull } from "@amigo/db";
import { ActionError } from "../lib/errors";
import { toCents } from "../lib/conversions";
import { getExchangeRateForRecord } from "../lib/exchange-rates";
import type { CurrencyCode } from "@amigo/db";

const assetSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["BANK", "INVESTMENT", "CASH", "PROPERTY"]),
  balance: z.number(),
  currency: z.enum(["CAD", "USD", "EUR", "GBP", "MXN"]).optional(),
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
  const db = getDb(c.env.DB);

  const userAssets = await db.query.assets.findMany({
    where: and(
      scopeToHousehold(assets.householdId, session.householdId),
      eq(assets.userId, session.userId),
      isNull(assets.deletedAt)
    ),
    orderBy: (assets, { desc }) => [desc(assets.createdAt)],
  });

  return c.json(userAssets);
});

// Create asset
assetsRoute.post("/", async (c) => {
  const session = c.get("appSession");
  const body = await c.req.json();
  const validated = assetSchema.parse(body);
  const db = getDb(c.env.DB);

  const currency = validated.currency ?? "CAD";
  const homeCurrency = await getHomeCurrency(db, session.householdId);
  const exchangeRateToHome = await getExchangeRateForRecord(c.env, currency, homeCurrency);

  const asset = await db
    .insert(assets)
    .values({
      householdId: session.householdId,
      userId: session.userId,
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
  const id = c.req.param("id");
  const body = await c.req.json();
  const validated = assetSchema.parse(body);
  const db = getDb(c.env.DB);

  const currency = validated.currency ?? "CAD";
  const homeCurrency = await getHomeCurrency(db, session.householdId);
  const exchangeRateToHome = await getExchangeRateForRecord(c.env, currency, homeCurrency);

  const updated = await db
    .update(assets)
    .set({
      name: validated.name.trim(),
      type: validated.type,
      balance: toCents(validated.balance),
      currency,
      exchangeRateToHome,
      updatedAt: new Date(),
    })
    .where(and(eq(assets.id, id), eq(assets.userId, session.userId)))
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
  const id = c.req.param("id");
  const db = getDb(c.env.DB);

  const deleted = await db
    .update(assets)
    .set({ deletedAt: new Date() })
    .where(and(eq(assets.id, id), eq(assets.userId, session.userId)))
    .returning()
    .get();

  if (!deleted) {
    throw new ActionError("Asset not found", "NOT_FOUND");
  }

  return c.json(deleted);
});
