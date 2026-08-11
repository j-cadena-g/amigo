import {
  and,
  debts,
  eq,
  getDb,
  isNull,
  or,
  scopeToHousehold,
} from "@amigo/db";
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
import { withAudit } from "../lib/audit";
import { zCurrencyCode } from "../lib/request-validation";

const currencySchema = zCurrencyCode.optional();

const loanShape = {
  type: z.literal("LOAN"),
  name: z.string().trim().min(1),
  loanAmount: z.number().positive(),
  totalPaid: z.number().min(0),
  currency: currencySchema,
  adminTakeover: z.boolean().optional(),
};

const creditCardShape = {
  type: z.literal("CREDIT_CARD"),
  name: z.string().trim().min(1),
  creditLimit: z.number().positive(),
  availableCredit: z.number().min(0),
  currency: currencySchema,
  adminTakeover: z.boolean().optional(),
};

const loanSchema = z
  .object({
    ...loanShape,
    isShared: z.boolean().optional().default(false),
  })
  .refine((data) => data.totalPaid <= data.loanAmount, {
    message: "Total paid cannot exceed loan amount",
    path: ["totalPaid"],
  });

const updateLoanSchema = z
  .object({
    ...loanShape,
    isShared: z.boolean().optional(),
  })
  .refine((data) => data.totalPaid <= data.loanAmount, {
    message: "Total paid cannot exceed loan amount",
    path: ["totalPaid"],
  });

const creditCardSchema = z
  .object({
    ...creditCardShape,
    isShared: z.boolean().optional().default(false),
  })
  .refine((data) => data.availableCredit <= data.creditLimit, {
    message: "Available credit cannot exceed credit limit",
    path: ["availableCredit"],
  });

const updateCreditCardSchema = z
  .object({
    ...creditCardShape,
    isShared: z.boolean().optional(),
  })
  .refine((data) => data.availableCredit <= data.creditLimit, {
    message: "Available credit cannot exceed credit limit",
    path: ["availableCredit"],
  });

const addDebtSchema = z.discriminatedUnion("type", [
  loanSchema,
  creditCardSchema,
]);
const updateDebtSchema = z.discriminatedUnion("type", [
  updateLoanSchema,
  updateCreditCardSchema,
]);

function debtToCents(
  validated: z.infer<typeof addDebtSchema> | z.infer<typeof updateDebtSchema>
) {
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
  const splatSegments = getSplatSegments(params);
  if (splatSegments.length > 1) {
    throw new ActionError("Debt not found", "NOT_FOUND");
  }

  const [id] = splatSegments;
  const db = getDb(env.DB);

  if (request.method === "GET" && !id) {
    await enforceRateLimit(
      env,
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
      env,
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

    const debtId = crypto.randomUUID();
    const debt = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "debts",
        recordId: debtId,
        operation: "INSERT",
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .insert(debts)
          .values({
            id: debtId,
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
          .get()
    );

    return Response.json(debt, { status: 201 });
  }

  if (request.method === "PATCH" && id) {
    await enforceRateLimit(
      env,
      `${session!.userId}:debts:update`,
      ROUTE_RATE_LIMITS.debts.update
    );

    const validated = updateDebtSchema.parse(await request.json());
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

    const nextUserId = resolveFinancialObjectUserId({
      session: session!,
      existingUserId: existing.userId,
      requestedIsShared: validated.isShared,
      adminTakeover: validated.adminTakeover,
      canManageShared: canManageSharedItems(session!),
      objectName: "debt",
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
    const { balanceInitial, balanceCurrent } = debtToCents(validated);

    const updated = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "debts",
        recordId: id,
        operation: "UPDATE",
        oldValues: existing,
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(debts)
          .set({
            userId: nextUserId,
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
              scopeToHousehold(debts.householdId, session!.householdId),
              isNull(debts.deletedAt)
            )
          )
          .returning()
          .get()
    );

    if (!updated) {
      throw new ActionError("Debt not found", "NOT_FOUND");
    }

    if (adminTakeover) {
      logSecurityEvent("personal_financial_object_takeover", {
        tableName: "debts",
        recordId: id,
        previousUserId: existing.userId,
        changedBy: session!.userId,
        householdId: session!.householdId,
      });
    }

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id) {
    await enforceRateLimit(
      env,
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

    const deleted = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "debts",
        recordId: id,
        operation: "DELETE",
        oldValues: existing,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(debts)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(debts.id, id),
              scopeToHousehold(debts.householdId, session!.householdId),
              isNull(debts.deletedAt)
            )
          )
          .returning()
          .get()
    );

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
