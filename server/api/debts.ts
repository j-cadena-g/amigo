import {
  and,
  debts,
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

const currencySchema = z.enum(["CAD", "USD", "EUR", "GBP", "MXN"]).optional();

const loanSchema = z
  .object({
    type: z.literal("LOAN"),
    name: z.string().min(1),
    loanAmount: z.number().positive(),
    totalPaid: z.number().min(0),
    currency: currencySchema,
    isShared: z.boolean().optional().default(false),
  })
  .refine((data) => data.totalPaid <= data.loanAmount, {
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

const addDebtSchema = z.discriminatedUnion("type", [
  loanSchema,
  creditCardSchema,
]);

async function getHomeCurrency(
  db: ReturnType<typeof getDb>,
  householdId: string
): Promise<CurrencyCode> {
  const household = await db.query.households.findFirst({
    where: eq(households.id, householdId),
  });
  return (household?.homeCurrency as CurrencyCode) ?? "CAD";
}

function debtToCents(validated: z.infer<typeof addDebtSchema>) {
  if (validated.type === "LOAN") {
    return {
      balanceInitial: toCents(validated.loanAmount),
      balanceCurrent: toCents(validated.totalPaid),
    };
  }

  return {
    balanceInitial: toCents(validated.creditLimit),
    balanceCurrent: toCents(validated.availableCredit),
  };
}

export const handleDebtsRequest: ApiHandler = async ({
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
      `${session!.userId}:debts:list`,
      ROUTE_RATE_LIMITS.debts.list
    );

    const userDebts = await db.query.debts.findMany({
      where: and(
        scopeToHousehold(debts.householdId, session!.householdId),
        or(eq(debts.userId, session!.userId), isNull(debts.userId)),
        isNull(debts.deletedAt)
      ),
      orderBy: (debt, { desc }) => [desc(debt.createdAt)],
    });

    return Response.json(
      userDebts.map((debt) => ({ ...debt, isShared: debt.userId === null }))
    );
  }

  if (request.method === "POST" && !id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:debts:create`,
      ROUTE_RATE_LIMITS.debts.create
    );

    const validated = addDebtSchema.parse(await request.json());
    if (validated.isShared) {
      assertPermission(
        canManageSharedItems(session!),
        "Only owners and admins can create shared debts"
      );
    }

    const currency = validated.currency ?? "CAD";
    const homeCurrency = await getHomeCurrency(db, session!.householdId);
    const exchangeRateToHome = await getExchangeRateForRecord(
      env,
      currency,
      homeCurrency
    );
    const { balanceInitial, balanceCurrent } = debtToCents(validated);

    const debt = await db
      .insert(debts)
      .values({
        householdId: session!.householdId,
        userId: validated.isShared ? null : session!.userId,
        name: validated.name.trim(),
        type: validated.type,
        balanceInitial,
        balanceCurrent,
        currency,
        exchangeRateToHome,
      })
      .returning()
      .get();

    return Response.json(debt, { status: 201 });
  }

  if (request.method === "PATCH" && id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:debts:update`,
      ROUTE_RATE_LIMITS.debts.update
    );

    const validated = addDebtSchema.parse(await request.json());
    const existing = await db.query.debts.findFirst({
      where: and(
        eq(debts.id, id),
        scopeToHousehold(debts.householdId, session!.householdId),
        isNull(debts.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Debt not found", "NOT_FOUND");
    }

    const isCurrentlyShared = existing.userId === null;
    if (isCurrentlyShared || validated.isShared) {
      assertPermission(
        canManageSharedItems(session!),
        "Only owners and admins can modify shared debts"
      );
    } else if (existing.userId !== session!.userId) {
      throw new ActionError(
        "Cannot modify another user's personal debt",
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
    const { balanceInitial, balanceCurrent } = debtToCents(validated);

    const updated = await db
      .update(debts)
      .set({
        userId: validated.isShared ? null : session!.userId,
        name: validated.name.trim(),
        type: validated.type,
        balanceInitial,
        balanceCurrent,
        currency,
        exchangeRateToHome,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(debts.id, id),
          scopeToHousehold(debts.householdId, session!.householdId)
        )
      )
      .returning()
      .get();

    if (!updated) {
      throw new ActionError("Debt not found", "NOT_FOUND");
    }

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:debts:delete`,
      ROUTE_RATE_LIMITS.debts.delete
    );

    const existing = await db.query.debts.findFirst({
      where: and(
        eq(debts.id, id),
        scopeToHousehold(debts.householdId, session!.householdId),
        isNull(debts.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Debt not found", "NOT_FOUND");
    }

    const isShared = existing.userId === null;
    if (isShared) {
      assertPermission(
        canManageSharedItems(session!),
        "Only owners and admins can delete shared debts"
      );
    } else if (existing.userId !== session!.userId) {
      throw new ActionError(
        "Cannot delete another user's personal debt",
        "PERMISSION_DENIED"
      );
    }

    const deleted = await db
      .update(debts)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(debts.id, id),
          scopeToHousehold(debts.householdId, session!.householdId)
        )
      )
      .returning()
      .get();

    if (!deleted) {
      throw new ActionError("Debt not found", "NOT_FOUND");
    }

    return Response.json(deleted);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
