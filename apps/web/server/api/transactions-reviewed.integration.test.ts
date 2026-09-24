import { eq, getDb, transactions } from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleTransactionsRequest } from "./transactions";
import {
  createTestDb,
  seedExpenseTransaction,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("transactions reviewed flag", () => {
  let householdId: string;
  let ownerId: string;
  let txnId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-reviewed-${suffix}`;
    ownerId = `user-reviewed-${suffix}`;
    txnId = crypto.randomUUID();

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_reviewed_${suffix}`,
    });
    await seedExpenseTransaction(db, {
      id: txnId,
      householdId,
      userId: ownerId,
      amount: 5000,
      category: "Dining",
    });
  });

  it("marks a transaction reviewed via PATCH and persists it", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    const session = testSession({ userId: ownerId, householdId });

    const response = await handleTransactionsRequest({
      env,
      params: { "*": txnId },
      request: new Request(`http://localhost/api/transactions/${txnId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed: true }),
      }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated).toMatchObject({ id: txnId, reviewed: true });

    const stored = await db.query.transactions.findFirst({
      where: eq(transactions.id, txnId),
    });
    expect(stored?.reviewed).toBe(true);
  });

  it("filters the list by reviewed state", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    const session = testSession({ userId: ownerId, householdId });

    // Second transaction stays unreviewed so reviewed=false has a positive hit.
    const unreviewedTxnId = crypto.randomUUID();
    await seedExpenseTransaction(db, {
      id: unreviewedTxnId,
      householdId,
      userId: ownerId,
      amount: 2500,
      category: "Groceries",
    });

    await db
      .update(transactions)
      .set({ reviewed: true })
      .where(eq(transactions.id, txnId));

    const reviewedResponse = await handleTransactionsRequest({
      env,
      params: { "*": "" },
      request: new Request("http://localhost/api/transactions?reviewed=true"),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
    const reviewedBody = (await reviewedResponse.json()) as {
      data: { id: string }[];
    };
    const reviewedIds = reviewedBody.data.map((t) => t.id);
    expect(reviewedIds).toContain(txnId);
    expect(reviewedIds).not.toContain(unreviewedTxnId);

    const unreviewedResponse = await handleTransactionsRequest({
      env,
      params: { "*": "" },
      request: new Request("http://localhost/api/transactions?reviewed=false"),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
    const unreviewedBody = (await unreviewedResponse.json()) as {
      data: { id: string }[];
    };
    const unreviewedIds = unreviewedBody.data.map((t) => t.id);
    expect(unreviewedIds).toContain(unreviewedTxnId);
    expect(unreviewedIds).not.toContain(txnId);
  });

  it("rejects an invalid reviewed query filter", async () => {
    const env = getIntegrationEnv();
    const session = testSession({ userId: ownerId, householdId });

    await expect(
      handleTransactionsRequest({
        env,
        params: { "*": "" },
        request: new Request("http://localhost/api/transactions?reviewed=maybe"),
        session,
        sessionStatus: "authenticated",
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
