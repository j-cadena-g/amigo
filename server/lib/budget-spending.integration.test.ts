import { beforeEach, describe, expect, it } from "vitest";
import { handleBudgetsRequest } from "../api/budgets";
import { getBudgetsWithSpending } from "./budget-spending";
import { getHouseholdTimezone } from "./household-timezone";
import { todayInTz } from "./dates";
import {
  createTestDb,
  seedExpenseTransaction,
  seedHouseholdWithOwner,
  seedMonthlyBudget,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

function mapDashboardBudgetSpending(
  budgets: Awaited<ReturnType<typeof getBudgetsWithSpending>>
) {
  return budgets.map((budget) => ({
    id: budget.id,
    name: budget.name,
    spentHomeCents: budget.currentSpendingHomeCents,
    limitHomeCents: budget.limitAmountHome,
    period: budget.period,
  }));
}

describe("budget spending integration", () => {
  let householdId: string;
  let ownerId: string;
  let groceriesBudgetId: string;
  let diningBudgetId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-budget-${suffix}`;
    ownerId = `user-budget-owner-${suffix}`;
    groceriesBudgetId = `budget-groceries-${suffix}`;
    diningBudgetId = `budget-dining-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    const testDate = todayInTz("UTC");
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_budget_owner_${suffix}`,
      timezone: "UTC",
    });
    await seedMonthlyBudget(db, {
      id: groceriesBudgetId,
      householdId,
      name: "Groceries",
      category: "groceries",
      limitAmount: 50_000,
      limitAmountHome: 50_000,
    });
    await seedMonthlyBudget(db, {
      id: diningBudgetId,
      householdId,
      name: "Dining",
      category: "dining",
      limitAmount: 20_000,
      limitAmountHome: 20_000,
    });
    await seedExpenseTransaction(db, {
      id: `tx-budget-groceries-1-${suffix}`,
      householdId,
      userId: ownerId,
      budgetId: groceriesBudgetId,
      amount: 4599,
      category: "groceries",
      date: testDate,
    });
    await seedExpenseTransaction(db, {
      id: `tx-budget-groceries-2-${suffix}`,
      householdId,
      userId: ownerId,
      budgetId: groceriesBudgetId,
      amount: 1200,
      category: "groceries",
      date: testDate,
    });
    await seedExpenseTransaction(db, {
      id: `tx-budget-dining-1-${suffix}`,
      householdId,
      userId: ownerId,
      budgetId: diningBudgetId,
      amount: 2150,
      category: "dining",
      date: testDate,
    });
  });

  it("matches dashboard and budgets page spending via getBudgetsWithSpending", async () => {
    const env = getIntegrationEnv();
    const db = createTestDb(env.DB);
    const session = testSession({ userId: ownerId, householdId });
    const timeZone = await getHouseholdTimezone(db, householdId);

    const direct = await getBudgetsWithSpending(db, {
      householdId,
      viewerUserId: ownerId,
      timeZone,
    });

    const dashboardView = mapDashboardBudgetSpending(direct);
    const budgetsPageView = mapDashboardBudgetSpending(
      await getBudgetsWithSpending(db, {
        householdId,
        viewerUserId: session.userId,
        timeZone,
        orderBy: "category",
      })
    );

    const apiResponse = await handleBudgetsRequest({
      env,
      params: { "*": "with-spending" },
      request: new Request("http://localhost/api/budgets/with-spending", {
        method: "GET",
      }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(apiResponse.status).toBe(200);
    const apiBudgets = (await apiResponse.json()) as Awaited<
      ReturnType<typeof getBudgetsWithSpending>
    >;

    const groceries = direct.find((budget) => budget.id === groceriesBudgetId);
    const dining = direct.find((budget) => budget.id === diningBudgetId);
    expect(groceries?.currentSpendingHomeCents).toBe(5799);
    expect(dining?.currentSpendingHomeCents).toBe(2150);

    expect(dashboardView).toEqual(
      direct.map((budget) => ({
        id: budget.id,
        name: budget.name,
        spentHomeCents: budget.currentSpendingHomeCents,
        limitHomeCents: budget.limitAmountHome,
        period: budget.period,
      }))
    );

    expect(budgetsPageView).toEqual(
      [...direct]
        .sort((a, b) =>
          (a.category ?? "").localeCompare(b.category ?? "")
        )
        .map((budget) => ({
          id: budget.id,
          name: budget.name,
          spentHomeCents: budget.currentSpendingHomeCents,
          limitHomeCents: budget.limitAmountHome,
          period: budget.period,
        }))
    );

    for (const budget of apiBudgets) {
      const expected = direct.find((row) => row.id === budget.id);
      expect(expected).toBeDefined();
      expect(budget.currentSpendingHomeCents).toBe(
        expected!.currentSpendingHomeCents
      );
      expect(budget.currentSpendingHomeCents).toBe(
        dashboardView.find((row) => row.id === budget.id)?.spentHomeCents
      );
    }
  });
});
