import {
  budgets,
  eq,
  getDb,
  recurringTransactions,
  transactions,
} from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleRecurringRequest } from "./recurring";
import { handleTransactionsRequest } from "./transactions";
import { buildRecurringOccurrenceTransactionId } from "../lib/recurring-processor";
import {
  createTestDb,
  seedFinancialCategory,
  seedHouseholdWithOwner,
  seedMonthlyBudget,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("recurring and occurrence amount edits", () => {
  let householdId: string;
  let ownerId: string;
  let categoryId: string;
  let budgetId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-recurring-edit-${suffix}`;
    ownerId = `user-recurring-edit-${suffix}`;
    categoryId = crypto.randomUUID();
    budgetId = crypto.randomUUID();

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_recurring_edit_${suffix}`,
    });
    await seedFinancialCategory(db, {
      id: categoryId,
      householdId,
      name: "Rent",
    });
    await seedMonthlyBudget(db, {
      id: budgetId,
      householdId,
      userId: ownerId,
      name: "Housing",
      category: "Rent",
      limitAmount: 200000,
    });
  });

  it("lets the owner change a rule amount after the linked budget is deleted", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    const session = testSession({ userId: ownerId, householdId });
    const ruleId = crypto.randomUUID();

    await db.insert(recurringTransactions).values({
      id: ruleId,
      householdId,
      userId: ownerId,
      amount: 150000,
      currency: "CAD",
      categoryId,
      category: "Rent",
      type: "expense",
      frequency: "MONTHLY",
      interval: 1,
      dayOfMonth: 1,
      startDate: "2026-01-01",
      nextRunDate: "2026-10-01",
      budgetId,
    });

    await db.update(budgets).set({ deletedAt: new Date() }).where(eq(budgets.id, budgetId));

    const response = await handleRecurringRequest({
      env,
      params: { "*": ruleId },
      request: new Request(`http://localhost/api/recurring/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "expense",
          amount: 1600,
          currency: "CAD",
          categoryId,
          description: null,
          frequency: "MONTHLY",
          interval: 1,
          dayOfMonth: 1,
          dayOfWeek: null,
          startDate: "2026-01-01",
          endDate: null,
          budgetId,
        }),
      }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated).toMatchObject({ amount: 160000 });
  });

  it("lets the owner change a posted occurrence amount after the linked budget is deleted", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    const session = testSession({ userId: ownerId, householdId });
    const ruleId = crypto.randomUUID();
    const occurrenceId = buildRecurringOccurrenceTransactionId(
      ruleId,
      "2026-09-01"
    );

    await db.insert(transactions).values({
      id: occurrenceId,
      householdId,
      userId: ownerId,
      amount: 150000,
      currency: "CAD",
      categoryId,
      category: "Rent",
      type: "expense",
      date: "2026-09-01",
      budgetId,
    });

    await db.update(budgets).set({ deletedAt: new Date() }).where(eq(budgets.id, budgetId));

    const response = await handleTransactionsRequest({
      env,
      params: { "*": occurrenceId },
      request: new Request(`http://localhost/api/transactions/${occurrenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 1600,
          description: null,
          categoryId,
          type: "expense",
          date: "2026-09-01",
          budgetId,
          currency: "CAD",
        }),
      }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated).toMatchObject({ id: occurrenceId, amount: 160000 });

    const stored = await db.query.transactions.findFirst({
      where: eq(transactions.id, occurrenceId),
    });
    expect(stored?.amount).toBe(160000);
  });

  it("still rejects assigning a different deleted budget", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    const session = testSession({ userId: ownerId, householdId });
    const ruleId = crypto.randomUUID();
    const otherBudgetId = crypto.randomUUID();

    await seedMonthlyBudget(db, {
      id: otherBudgetId,
      householdId,
      userId: ownerId,
      name: "Old housing",
      category: "Rent",
      limitAmount: 100000,
    });
    await db.update(budgets).set({ deletedAt: new Date() }).where(eq(budgets.id, otherBudgetId));

    await db.insert(recurringTransactions).values({
      id: ruleId,
      householdId,
      userId: ownerId,
      amount: 150000,
      currency: "CAD",
      categoryId,
      category: "Rent",
      type: "expense",
      frequency: "MONTHLY",
      interval: 1,
      dayOfMonth: 1,
      startDate: "2026-01-01",
      nextRunDate: "2026-10-01",
      budgetId,
    });

    await expect(
      handleRecurringRequest({
        env,
        params: { "*": ruleId },
        request: new Request(`http://localhost/api/recurring/${ruleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: 1600,
            budgetId: otherBudgetId,
          }),
        }),
        session,
        sessionStatus: "authenticated",
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Unknown or inaccessible budget",
    });
  });
});
