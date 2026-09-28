import { eq, financialAccounts, getDb } from "@amigo/db";
import { ZodError } from "zod";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAccountsRequest } from "./accounts";
import { handleDashboardRequest } from "./dashboard";
import {
  createTestDb,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("accounts liabilities integration", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-acct-liab-${suffix}`;
    ownerId = `user-acct-liab-owner-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_acct_liab_owner_${suffix}`,
    });
  });

  function callAccounts(method: "POST" | "PATCH", body: unknown, id?: string) {
    return handleAccountsRequest({
      env: getIntegrationEnv(),
      params: id ? { "*": id } : {},
      request: new Request(`http://localhost/api/accounts${id ? `/${id}` : ""}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      session: testSession({ userId: ownerId, householdId }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
  }

  /** The handler throws a ZodError; handleApiRoute maps it to a 400 with the issues. */
  async function expectRejectedWith(promise: Promise<Response>, message: string) {
    const error = await promise.then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(ZodError);
    expect((error as ZodError).issues.map((issue) => issue.message)).toContain(message);
  }

  async function findAccount(id: string) {
    return getDb(getIntegrationEnv().DB).query.financialAccounts.findFirst({
      where: eq(financialAccounts.id, id),
    });
  }

  it("stores a credit card's limit in cents and accepts a negative balance", async () => {
    const res = await callAccounts("POST", {
      name: "Visa",
      type: "CREDIT",
      balance: -250.5,
      creditLimit: 5000.25,
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const row = await findAccount(id);
    expect(row?.type).toBe("CREDIT");
    expect(row?.balance).toBe(-25050);
    expect(row?.creditLimit).toBe(500025);
    expect(row?.originalAmount).toBeNull();
  });

  it("accepts a credit card without a known limit", async () => {
    const res = await callAccounts("POST", { name: "Visa", type: "CREDIT", balance: -40 });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await findAccount(id))?.creditLimit).toBeNull();
  });

  it("rejects a credit card with an original amount", async () => {
    await expectRejectedWith(
      callAccounts("POST", {
        name: "Visa",
        type: "CREDIT",
        balance: 0,
        creditLimit: 1000,
        originalAmount: 500,
      }),
      "Original amount only applies to loans"
    );
  });

  it("stores a loan's original amount in cents", async () => {
    const res = await callAccounts("POST", {
      name: "Car loan",
      type: "LOAN",
      balance: -8000,
      originalAmount: 12000.5,
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const row = await findAccount(id);
    expect(row?.type).toBe("LOAN");
    expect(row?.balance).toBe(-800000);
    expect(row?.originalAmount).toBe(1200050);
    expect(row?.creditLimit).toBeNull();
  });

  it("accepts a loan without an original amount", async () => {
    const res = await callAccounts("POST", { name: "Car loan", type: "LOAN", balance: -100 });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await findAccount(id))?.originalAmount).toBeNull();
  });

  it("rejects a loan with a credit limit", async () => {
    await expectRejectedWith(
      callAccounts("POST", {
        name: "Car loan",
        type: "LOAN",
        balance: 0,
        originalAmount: 1000,
        creditLimit: 500,
      }),
      "Credit limit only applies to credit cards"
    );
  });

  it("rejects a checking account with a credit limit or an original amount", async () => {
    await expectRejectedWith(
      callAccounts("POST", { name: "Main", type: "CHECKING", balance: 0, creditLimit: 500 }),
      "Credit limit only applies to credit cards"
    );
    await expectRejectedWith(
      callAccounts("POST", { name: "Main", type: "CHECKING", balance: 0, originalAmount: 500 }),
      "Original amount only applies to loans"
    );
  });

  it("accepts null limits on a checking account", async () => {
    const res = await callAccounts("POST", {
      name: "Main",
      type: "CHECKING",
      balance: 10,
      creditLimit: null,
      originalAmount: null,
    });
    expect(res.status).toBe(201);
  });

  it("clears the credit limit when a credit card becomes a checking account", async () => {
    const created = await callAccounts("POST", {
      name: "Visa",
      type: "CREDIT",
      balance: -100,
      creditLimit: 2000,
    });
    const { id } = (await created.json()) as { id: string };
    expect((await findAccount(id))?.creditLimit).toBe(200000);

    const updated = await callAccounts(
      "PATCH",
      { name: "Visa", type: "CHECKING", balance: 0 },
      id
    );
    expect(updated.status).toBe(200);

    const row = await findAccount(id);
    expect(row?.type).toBe("CHECKING");
    expect(row?.creditLimit).toBeNull();
    expect(row?.originalAmount).toBeNull();
  });

  it("keeps a credit limit the update leaves out, and clears one sent as null", async () => {
    const created = await callAccounts("POST", {
      name: "Visa",
      type: "CREDIT",
      balance: -100,
      creditLimit: 2000,
    });
    const { id } = (await created.json()) as { id: string };

    const renamed = await callAccounts(
      "PATCH",
      { name: "Visa Infinite", type: "CREDIT", balance: -150 },
      id
    );
    expect(renamed.status).toBe(200);
    expect((await findAccount(id))?.creditLimit).toBe(200000);

    const cleared = await callAccounts(
      "PATCH",
      { name: "Visa Infinite", type: "CREDIT", balance: -150, creditLimit: null },
      id
    );
    expect(cleared.status).toBe(200);
    expect((await findAccount(id))?.creditLimit).toBeNull();
  });

  it("clears the original amount when a loan becomes a credit card", async () => {
    const created = await callAccounts("POST", {
      name: "Loan",
      type: "LOAN",
      balance: -100,
      originalAmount: 500,
    });
    const { id } = (await created.json()) as { id: string };

    const updated = await callAccounts(
      "PATCH",
      { name: "Loan", type: "CREDIT", balance: -100, creditLimit: 900 },
      id
    );
    expect(updated.status).toBe(200);

    const row = await findAccount(id);
    expect(row?.creditLimit).toBe(90000);
    expect(row?.originalAmount).toBeNull();
  });

  it("counts liability accounts as debts, not assets, in the dashboard net worth", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);

    const loadDashboard = async () => {
      const response = await handleDashboardRequest({
        env,
        params: {},
        request: new Request("http://localhost/api/dashboard"),
        session: testSession({ userId: ownerId, householdId }),
        sessionStatus: "authenticated",
        loadContext: {} as never,
      });
      expect(response.status).toBe(200);
      return (await response.json()) as {
        assetsCents: number;
        debtsCents: number;
        netWorthCents: number;
      };
    };

    const before = await loadDashboard();

    await db.insert(financialAccounts).values({
      id: `acct-loan-${crypto.randomUUID()}`,
      householdId,
      userId: ownerId,
      name: "Car loan",
      type: "LOAN",
      balance: -5000000,
      originalAmount: 6000000,
      currency: "CAD",
    });
    const withLoan = await loadDashboard();
    expect(withLoan.assetsCents).toBe(before.assetsCents);
    expect(withLoan.debtsCents).toBe(before.debtsCents + 5000000);
    expect(withLoan.netWorthCents).toBe(before.netWorthCents - 5000000);

    // Control: an ordinary account counts as an asset.
    await db.insert(financialAccounts).values({
      id: `acct-checking-${crypto.randomUUID()}`,
      householdId,
      userId: ownerId,
      name: "Main",
      type: "CHECKING",
      balance: 10000,
      currency: "CAD",
    });
    const withChecking = await loadDashboard();
    expect(withChecking.assetsCents).toBe(before.assetsCents + 10000);
    expect(withChecking.debtsCents).toBe(withLoan.debtsCents);
    expect(withChecking.netWorthCents).toBe(withLoan.netWorthCents + 10000);
  });
});
