import { beforeEach, describe, expect, it } from "vitest";
import { handleDashboardRequest } from "./dashboard";
import {
  createTestDb,
  seedExpenseTransaction,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("dashboard integration", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-dashboard-${suffix}`;
    ownerId = `user-dashboard-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_dashboard_${suffix}`,
    });
  });

  it("returns the aggregated dashboard payload as JSON", async () => {
    const env = getIntegrationEnv();
    const db = createTestDb(env.DB);
    const session = testSession({ userId: ownerId, householdId });

    await seedExpenseTransaction(db, {
      id: crypto.randomUUID(),
      householdId,
      userId: ownerId,
      amount: 12345,
      category: "Dining",
    });

    const response = await handleDashboardRequest({
      env,
      params: {},
      request: new Request("http://localhost/api/dashboard"),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      recentTransactions: unknown[];
      budgetsWithSpending: unknown[];
      calendarEvents: unknown[];
    };
    expect(body).toMatchObject({
      spendingCents: expect.any(Number),
      incomeCents: expect.any(Number),
      netCents: expect.any(Number),
      netWorthCents: expect.any(Number),
      currency: expect.any(String),
    });
    expect(Array.isArray(body.recentTransactions)).toBe(true);
    expect(Array.isArray(body.budgetsWithSpending)).toBe(true);
    expect(Array.isArray(body.calendarEvents)).toBe(true);
  });

  it("rejects non-GET methods with 405", async () => {
    const env = getIntegrationEnv();
    const session = testSession({ userId: ownerId, householdId });

    const response = await handleDashboardRequest({
      env,
      params: {},
      request: new Request("http://localhost/api/dashboard", { method: "POST" }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });
});
