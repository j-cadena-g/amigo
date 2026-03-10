import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../env";
import { getDb, debts, households, scopeToHousehold, eq, and, or, isNull } from "@amigo/db";
import { ActionError } from "../lib/errors";
import { assertPermission, canManageSharedItems } from "../lib/permissions";
import { toCents } from "../lib/conversions";
import { getExchangeRateForRecord } from "../lib/exchange-rates";
import type { CurrencyCode } from "@amigo/db";

const currencySchema = z.enum(["CAD", "USD", "EUR", "GBP", "MXN"]).optional();

const loanSchema = z.object({
  type: z.literal("LOAN"),
  name: z.string().min(1),
  loanAmount: z.number().positive(),
  totalPaid: z.number().min(0),
  currency: currencySchema,
  isShared: z.boolean().optional().default(false),
}).refine((data) => data.totalPaid <= data.loanAmount, {
  message: "Total paid cannot exceed loan amount",
  path: ["totalPaid"],
});

const creditCardSchema = z.object({
  type: z.literal("CREDIT_CARD"),
  name: z.string().min(1),
  creditLimit: z.number().positive(),
  availableCredit: z.number().min(0),
  currency: currencySchema,
  isShared: z.boolean().optional().default(false),
});

const addDebtSchema = z.discriminatedUnion("type", [loanSchema, creditCardSchema]);

export const debtsRoute = new Hono<HonoEnv>();

async function getHomeCurrency(db: ReturnType<typeof getDb>, householdId: string): Promise<CurrencyCode> {
  const household = await db.query.households.findFirst({
    where: eq(households.id, householdId),
  });
  return (household?.homeCurrency as CurrencyCode) ?? "CAD";
}

function debtToCents(validated: z.infer<typeof addDebtSchema>): { balanceInitial: number; balanceCurrent: number } {
  if (validated.type === "LOAN") {
    return { balanceInitial: toCents(validated.loanAmount), balanceCurrent: toCents(validated.totalPaid) };
  }
  return { balanceInitial: toCents(validated.creditLimit), balanceCurrent: toCents(validated.availableCredit) };
}

// List debts
debtsRoute.get("/", async (c) => {
  const session = c.get("appSession");
  const db = getDb(c.env.DB);

  const userDebts = await db.query.debts.findMany({
    where: and(
      scopeToHousehold(debts.householdId, session.householdId),
      or(eq(debts.userId, session.userId), isNull(debts.userId)),
      isNull(debts.deletedAt)
    ),
    orderBy: (debts, { desc }) => [desc(debts.createdAt)],
  });

  return c.json(userDebts.map(d => ({ ...d, isShared: d.userId === null })));
});

// Create debt
debtsRoute.post("/", async (c) => {
  const session = c.get("appSession");
  const body = await c.req.json();
  const validated = addDebtSchema.parse(body);
  const db = getDb(c.env.DB);

  if (validated.isShared) {
    assertPermission(canManageSharedItems(session), "Only owners and admins can create shared debts");
  }

  const currency = validated.currency ?? "CAD";
  const homeCurrency = await getHomeCurrency(db, session.householdId);
  const exchangeRateToHome = await getExchangeRateForRecord(c.env, currency, homeCurrency);
  const { balanceInitial, balanceCurrent } = debtToCents(validated);

  const debt = await db
    .insert(debts)
    .values({
      householdId: session.householdId,
      userId: validated.isShared ? null : session.userId,
      name: validated.name.trim(),
      type: validated.type,
      balanceInitial,
      balanceCurrent,
      currency,
      exchangeRateToHome,
    })
    .returning()
    .get();

  return c.json(debt, 201);
});

// Update debt
debtsRoute.patch("/:id", async (c) => {
  const session = c.get("appSession");
  const id = c.req.param("id");
  const body = await c.req.json();
  const validated = addDebtSchema.parse(body);
  const db = getDb(c.env.DB);

  const existing = await db.query.debts.findFirst({
    where: and(
      eq(debts.id, id),
      scopeToHousehold(debts.householdId, session.householdId),
      isNull(debts.deletedAt)
    ),
  });

  if (!existing) {
    throw new ActionError("Debt not found", "NOT_FOUND");
  }

  const isCurrentlyShared = existing.userId === null;
  if (isCurrentlyShared || validated.isShared) {
    assertPermission(canManageSharedItems(session), "Only owners and admins can modify shared debts");
  } else if (existing.userId !== session.userId) {
    throw new ActionError("Cannot modify another user's personal debt", "PERMISSION_DENIED");
  }

  const currency = validated.currency ?? "CAD";
  const homeCurrency = await getHomeCurrency(db, session.householdId);
  const exchangeRateToHome = await getExchangeRateForRecord(c.env, currency, homeCurrency);
  const { balanceInitial, balanceCurrent } = debtToCents(validated);

  const updated = await db
    .update(debts)
    .set({
      userId: validated.isShared ? null : session.userId,
      name: validated.name.trim(),
      type: validated.type,
      balanceInitial,
      balanceCurrent,
      currency,
      exchangeRateToHome,
      updatedAt: new Date(),
    })
    .where(and(eq(debts.id, id), scopeToHousehold(debts.householdId, session.householdId)))
    .returning()
    .get();

  if (!updated) {
    throw new ActionError("Debt not found", "NOT_FOUND");
  }

  return c.json(updated);
});

// Delete debt (soft)
debtsRoute.delete("/:id", async (c) => {
  const session = c.get("appSession");
  const id = c.req.param("id");
  const db = getDb(c.env.DB);

  const existing = await db.query.debts.findFirst({
    where: and(
      eq(debts.id, id),
      scopeToHousehold(debts.householdId, session.householdId),
      isNull(debts.deletedAt)
    ),
  });

  if (!existing) {
    throw new ActionError("Debt not found", "NOT_FOUND");
  }

  const isShared = existing.userId === null;
  if (isShared) {
    assertPermission(canManageSharedItems(session), "Only owners and admins can delete shared debts");
  } else if (existing.userId !== session.userId) {
    throw new ActionError("Cannot delete another user's personal debt", "PERMISSION_DENIED");
  }

  const deleted = await db
    .update(debts)
    .set({ deletedAt: new Date() })
    .where(and(eq(debts.id, id), scopeToHousehold(debts.householdId, session.householdId)))
    .returning()
    .get();

  if (!deleted) {
    throw new ActionError("Debt not found", "NOT_FOUND");
  }

  return c.json(deleted);
});
