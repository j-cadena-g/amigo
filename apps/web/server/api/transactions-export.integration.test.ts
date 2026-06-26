import { getDb, transactions } from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleTransactionsRequest } from "./transactions";
import {
  createTestDb,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("transactions export integration", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-export-${suffix}`;
    ownerId = `user-export-owner-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_export_owner_${suffix}`,
    });
  });

  it("neutralizes formula-leading CSV cells", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    await db.insert(transactions).values({
      id: crypto.randomUUID(),
      householdId,
      userId: ownerId,
      amount: 1200,
      currency: "CAD",
      category: "=HYPERLINK(\"https://example.com\")",
      description: "+SUM(1,2)",
      type: "expense",
      date: "2026-06-17",
    });

    const response = await handleTransactionsRequest({
      env,
      params: { "*": "export" },
      request: new Request("http://localhost/api/transactions/export", {
        method: "GET",
      }),
      sessionStatus: "authenticated",
      session: testSession({ userId: ownerId, householdId }),
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://example.com\"\")\"");
    expect(csv).toContain("\"'+SUM(1,2)\"");
  });
});
