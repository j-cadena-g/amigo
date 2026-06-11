import { and, eq, getDb, isNull, transactions } from "@amigo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as amigoDb from "@amigo/db";
import { todayInTz } from "../lib/dates";
import { handleTransactionsRequest } from "./transactions";
import {
  createTestDb,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("transactions import integration", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-import-${suffix}`;
    ownerId = `user-import-owner-${suffix}`;

    const env = getIntegrationEnv();
    const db = createTestDb(env.DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      clerkOrgId: `org_import_${suffix}`,
      ownerId,
      ownerAuthId: `clerk_import_owner_${suffix}`,
    });
  });

  it("inserts rows on non-dry-run import and dedupes externalId via db.batch", async () => {
    const originalGetDb = amigoDb.getDb;
    const batchSpies: ReturnType<typeof vi.spyOn>[] = [];

    vi.spyOn(amigoDb, "getDb").mockImplementation((d1) => {
      const db = originalGetDb(d1);
      batchSpies.push(vi.spyOn(db, "batch"));
      return db;
    });

    const env = getIntegrationEnv();
    const session = testSession({ userId: ownerId, householdId });
    const today = todayInTz("UTC");
    const rows = [
      {
        date: today,
        type: "expense" as const,
        category: "groceries",
        amount: 12.34,
        externalId: "ext-001",
      },
      {
        date: today,
        type: "expense" as const,
        category: "dining",
        amount: 5.5,
        externalId: "ext-002",
      },
      {
        date: today,
        type: "expense" as const,
        category: "groceries",
        amount: 9.99,
        externalId: "ext-001",
      },
    ];

    const importRequest = new Request("http://localhost/api/transactions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, dryRun: false }),
    });

    const response = await handleTransactionsRequest({
      env,
      params: { "*": "import" },
      request: importRequest,
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      ok: boolean;
      inserted: number;
      skipped: number;
    };
    expect(body).toMatchObject({ ok: true, inserted: 2, skipped: 1 });

    const db = getDb(env.DB);
    const stored = await db
      .select({ externalId: transactions.externalId })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          isNull(transactions.deletedAt)
        )
      );
    expect(stored.map((row) => row.externalId).sort()).toEqual([
      "ext-001",
      "ext-002",
    ]);

    expect(batchSpies.length).toBeGreaterThan(0);
    expect(batchSpies.some((spy) => spy.mock.calls.length > 0)).toBe(true);
    for (const spy of batchSpies) {
      expect(spy).not.toHaveProperty("mockName", "transaction");
    }

    const reimportResponse = await handleTransactionsRequest({
      env,
      params: { "*": "import" },
      request: new Request("http://localhost/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            {
              date: today,
              type: "expense",
              category: "groceries",
              amount: 1,
              externalId: "ext-001",
            },
          ],
          dryRun: false,
        }),
      }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(reimportResponse.status).toBe(201);
    const reimportBody = (await reimportResponse.json()) as {
      inserted: number;
      skipped: number;
    };
    expect(reimportBody).toMatchObject({ inserted: 0, skipped: 1 });

    const afterReimport = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          isNull(transactions.deletedAt)
        )
      );
    expect(afterReimport).toHaveLength(2);

    vi.restoreAllMocks();
  });
});
