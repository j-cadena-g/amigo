import {
  and,
  eq,
  financialAccounts,
  getDb,
  recurringTransactions,
  scopeToHousehold,
  transactions,
} from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleRecurringRequest } from "./recurring";
import { EXPENSE_ACCOUNT_ERROR } from "../lib/financial-refs";
import {
  createTestDb,
  seedFinancialCategory,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("recurring rule account link", () => {
  let householdId: string;
  let ownerId: string;
  let categoryId: string;
  let incomeCategoryId: string;
  let cardId: string;
  let bankId: string;
  let loanId: string;
  let investmentId: string;
  let propertyId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-recurring-acct-${suffix}`;
    ownerId = `user-recurring-acct-${suffix}`;
    categoryId = crypto.randomUUID();
    incomeCategoryId = crypto.randomUUID();
    cardId = crypto.randomUUID();
    bankId = crypto.randomUUID();
    loanId = crypto.randomUUID();
    investmentId = crypto.randomUUID();
    propertyId = crypto.randomUUID();

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_recurring_acct_${suffix}`,
    });
    await seedFinancialCategory(db, { id: categoryId, householdId, name: "Dining" });
    await seedFinancialCategory(db, {
      id: incomeCategoryId,
      householdId,
      name: "Salary",
      type: "income",
    });
    await db.insert(financialAccounts).values([
      {
        id: cardId,
        householdId,
        userId: ownerId,
        name: "Visa",
        type: "CREDIT",
        balance: -25000,
        currency: "CAD",
      },
      {
        id: bankId,
        householdId,
        userId: null,
        name: "Chequing",
        type: "CHECKING",
        balance: 100000,
        currency: "CAD",
      },
      {
        id: loanId,
        householdId,
        userId: null,
        name: "Car loan",
        type: "LOAN",
        balance: -800000,
        currency: "CAD",
      },
      {
        id: investmentId,
        householdId,
        userId: null,
        name: "Brokerage",
        type: "INVESTMENT",
        balance: 500000,
        currency: "CAD",
      },
      {
        id: propertyId,
        householdId,
        userId: null,
        name: "Cabin",
        type: "PROPERTY",
        balance: 30000000,
        currency: "CAD",
      },
    ]);
  });

  function call(method: "POST" | "PATCH", body?: unknown, id?: string) {
    return handleRecurringRequest({
      env: getIntegrationEnv(),
      params: { "*": id ?? "" },
      request: new Request(`http://localhost/api/recurring${id ? `/${id}` : ""}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      session: testSession({ userId: ownerId, householdId }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
  }

  async function create(extra: Record<string, unknown> = {}) {
    const response = await call("POST", {
      amount: 40,
      categoryId,
      type: "expense",
      frequency: "MONTHLY",
      startDate: "2026-10-01",
      ...extra,
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string; accountId: string | null };
  }

  async function storedAccountId(id: string) {
    const row = await getDb(getIntegrationEnv().DB).query.recurringTransactions.findFirst({
      where: and(
        scopeToHousehold(recurringTransactions.householdId, householdId),
        eq(recurringTransactions.id, id)
      ),
    });
    return row?.accountId;
  }

  const expenseAccountError = {
    code: "VALIDATION_ERROR",
    message: EXPENSE_ACCOUNT_ERROR,
  };

  it("stores a checking or credit-card account on an expense rule", async () => {
    const onCard = await create({ accountId: cardId });
    expect(onCard.accountId).toBe(cardId);
    expect(await storedAccountId(onCard.id)).toBe(cardId);

    const onBank = await create({ accountId: bankId });
    expect(await storedAccountId(onBank.id)).toBe(bankId);
  });

  it("rejects an expense on a loan, investment, or property and allows income there", async () => {
    await expect(create({ accountId: loanId })).rejects.toMatchObject(expenseAccountError);
    await expect(create({ accountId: investmentId })).rejects.toMatchObject(expenseAccountError);
    await expect(create({ accountId: propertyId })).rejects.toMatchObject(expenseAccountError);

    const income = await create({
      type: "income",
      categoryId: incomeCategoryId,
      accountId: loanId,
    });
    expect(income.accountId).toBe(loanId);
    expect(await storedAccountId(income.id)).toBe(loanId);
  });

  it("rejects an account from another household", async () => {
    const suffix = crypto.randomUUID();
    const otherHouseholdId = `hh-recurring-acct-other-${suffix}`;
    const otherAccountId = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId: otherHouseholdId,
      ownerId: `user-recurring-acct-other-${suffix}`,
      ownerAuthId: `clerk_recurring_acct_other_${suffix}`,
    });
    await db.insert(financialAccounts).values({
      id: otherAccountId,
      householdId: otherHouseholdId,
      name: "Elsewhere",
      type: "CHECKING",
    });

    await expect(create({ accountId: otherAccountId })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Unknown or inaccessible account",
    });
  });

  it("moves and clears the account on update", async () => {
    const { id } = await create({ accountId: cardId });

    const moved = await call("PATCH", { accountId: bankId }, id);
    expect(moved.status).toBe(200);
    expect(await storedAccountId(id)).toBe(bankId);

    const cleared = await call("PATCH", { accountId: null }, id);
    expect(cleared.status).toBe(200);
    expect(await storedAccountId(id)).toBeNull();
  });

  it("rejects flipping income onto a kept loan account", async () => {
    const { id } = await create({
      type: "income",
      categoryId: incomeCategoryId,
      accountId: loanId,
    });

    await expect(
      call("PATCH", { type: "expense", categoryId }, id)
    ).rejects.toMatchObject(expenseAccountError);
    expect(await storedAccountId(id)).toBe(loanId);
  });

  it("keeps a soft-deleted account when an edit does not change the link", async () => {
    const { id } = await create({ accountId: bankId });
    await getDb(getIntegrationEnv().DB)
      .update(financialAccounts)
      .set({ deletedAt: new Date() })
      .where(eq(financialAccounts.id, bankId));

    const response = await call("PATCH", { amount: 45 }, id);
    expect(response.status).toBe(200);
    expect(await storedAccountId(id)).toBe(bankId);
  });

  it("posts an occurrence with the rule's account", async () => {
    const db = getDb(getIntegrationEnv().DB);
    const ruleId = crypto.randomUUID();
    await db.insert(recurringTransactions).values({
      id: ruleId,
      householdId,
      userId: ownerId,
      amount: 4000,
      currency: "CAD",
      categoryId,
      category: "Dining",
      type: "expense",
      frequency: "MONTHLY",
      interval: 1,
      dayOfMonth: 1,
      startDate: "2020-01-01",
      nextRunDate: "2020-01-01",
      accountId: cardId,
    });

    const response = await call("POST", undefined, "process");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processed: 1 });

    const posted = await db.query.transactions.findFirst({
      where: and(
        scopeToHousehold(transactions.householdId, householdId),
        eq(transactions.accountId, cardId)
      ),
    });
    expect(posted?.accountId).toBe(cardId);
    expect(posted?.date).toBe("2020-01-01");
  });
});
