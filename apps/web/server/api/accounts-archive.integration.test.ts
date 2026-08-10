import { and, eq, financialAccounts, getDb } from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAccountsRequest } from "./accounts";
import {
  createTestDb,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("accounts archive integration", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-acct-archive-${suffix}`;
    ownerId = `user-acct-archive-owner-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_acct_archive_owner_${suffix}`,
    });
  });

  it("archives and restores without mutating other fields", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    const session = testSession({ userId: ownerId, householdId });
    const accountId = `acct-${crypto.randomUUID()}`;

    await db.insert(financialAccounts).values({
      id: accountId,
      householdId,
      userId: ownerId,
      name: "Vault",
      type: "SAVINGS",
      balance: 5000,
      currency: "CAD",
      archived: false,
    });

    const archiveRes = await handleAccountsRequest({
      env,
      params: { "*": `${accountId}/archived` },
      request: new Request(
        `http://localhost/api/accounts/${accountId}/archived`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        }
      ),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
    expect(archiveRes.status).toBe(200);

    const archived = await db.query.financialAccounts.findFirst({
      where: eq(financialAccounts.id, accountId),
    });
    expect(archived?.archived).toBe(true);
    expect(archived?.name).toBe("Vault");
    expect(archived?.balance).toBe(5000);
    expect(archived?.type).toBe("SAVINGS");
    expect(archived?.currency).toBe("CAD");
    expect(archived?.userId).toBe(ownerId);
    expect(archived?.exchangeRateToHome).toBeNull();

    // Concurrent edit to name/balance should survive a restore call.
    await db
      .update(financialAccounts)
      .set({ name: "Vault updated", balance: 9000 })
      .where(
        and(
          eq(financialAccounts.id, accountId),
          eq(financialAccounts.householdId, householdId)
        )
      );

    const restoreRes = await handleAccountsRequest({
      env,
      params: { "*": `${accountId}/archived` },
      request: new Request(
        `http://localhost/api/accounts/${accountId}/archived`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: false }),
        }
      ),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
    expect(restoreRes.status).toBe(200);

    const restored = await db.query.financialAccounts.findFirst({
      where: eq(financialAccounts.id, accountId),
    });
    expect(restored?.archived).toBe(false);
    expect(restored?.name).toBe("Vault updated");
    expect(restored?.balance).toBe(9000);
    expect(restored?.type).toBe("SAVINGS");
    expect(restored?.currency).toBe("CAD");
    expect(restored?.userId).toBe(ownerId);
    expect(restored?.exchangeRateToHome).toBeNull();
  });
});
