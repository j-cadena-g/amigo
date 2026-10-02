import {
  financialAccounts,
  merchantAliases,
  scopeToHousehold,
  transactions,
} from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanBankDescription } from "../lib/bank-description";
import { upsertAiAlias } from "../lib/merchant-aliases";
import {
  createTestDb,
  seedFinancialCategory,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import { statement, transaction } from "../test/ofx-fixture";
import { handleTransactionsRequest } from "./transactions";

const WALMART = "WAL-MART # 3050        LONDON        ON";

describe("merchant aliases", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    householdId = crypto.randomUUID();
    ownerId = crypto.randomUUID();
    await seedHouseholdWithOwner(createTestDb(getIntegrationEnv().DB), {
      householdId,
      ownerId,
      ownerAuthId: crypto.randomUUID(),
    });
  });

  const db = () => createTestDb(getIntegrationEnv().DB);
  const aliases = () =>
    db()
      .select()
      .from(merchantAliases)
      .where(scopeToHousehold(merchantAliases.householdId, householdId));
  const patch = (id: string, body: Record<string, unknown>) =>
    handleTransactionsRequest({
      env: getIntegrationEnv(),
      params: { "*": id },
      request: new Request(`http://localhost/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      session: testSession({ userId: ownerId, householdId }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

  async function seedRow(options: {
    id?: string;
    categoryId: string;
    category: string;
    description: string;
    bankDescription?: string | null;
  }) {
    const id = options.id ?? crypto.randomUUID();
    await db().insert(transactions).values({
      id,
      householdId,
      userId: ownerId,
      amount: 1234,
      currency: "CAD",
      categoryId: options.categoryId,
      category: options.category,
      description: options.description,
      bankDescription: options.bankDescription ?? null,
      type: "expense",
      date: "2026-09-29",
    });
    return id;
  }

  it("creates and updates a user alias when an imported row is patched", async () => {
    const groceries = crypto.randomUUID();
    const dining = crypto.randomUUID();
    await seedFinancialCategory(db(), { id: groceries, householdId, name: "Groceries" });
    await seedFinancialCategory(db(), { id: dining, householdId, name: "Dining" });
    const id = await seedRow({
      categoryId: groceries,
      category: "Groceries",
      description: "Wal-Mart",
      bankDescription: WALMART,
    });
    const merchantKey = cleanBankDescription(WALMART, "en").merchantKey;

    expect((await patch(id, { description: "My Walmart", categoryId: dining })).status).toBe(
      200
    );
    expect(await aliases()).toEqual([
      expect.objectContaining({
        merchantKey,
        displayName: "My Walmart",
        categoryId: dining,
        source: "user",
      }),
    ]);

    expect(
      (await patch(id, { description: "Neighbourhood Walmart", categoryId: groceries })).status
    ).toBe(200);
    expect(await aliases()).toEqual([
      expect.objectContaining({
        merchantKey,
        displayName: "Neighbourhood Walmart",
        categoryId: groceries,
        source: "user",
      }),
    ]);
  });

  it("writes no alias when a manual row is patched", async () => {
    const groceries = crypto.randomUUID();
    const dining = crypto.randomUUID();
    await seedFinancialCategory(db(), { id: groceries, householdId, name: "Groceries" });
    await seedFinancialCategory(db(), { id: dining, householdId, name: "Dining" });
    const id = await seedRow({
      categoryId: groceries,
      category: "Groceries",
      description: "Market",
    });

    expect((await patch(id, { description: "Corner market", categoryId: dining })).status).toBe(
      200
    );
    expect(await aliases()).toEqual([]);
  });

  it("leaves an alias category alone when a patch chooses Uncategorized", async () => {
    const groceries = crypto.randomUUID();
    const uncategorized = crypto.randomUUID();
    await seedFinancialCategory(db(), { id: groceries, householdId, name: "Groceries" });
    await seedFinancialCategory(db(), {
      id: uncategorized,
      householdId,
      name: "Uncategorized",
    });
    const merchantKey = cleanBankDescription(WALMART, "en").merchantKey;
    await db().insert(merchantAliases).values({
      householdId,
      merchantKey,
      displayName: "My Walmart",
      categoryId: groceries,
      source: "user",
    });
    const id = await seedRow({
      categoryId: groceries,
      category: "Groceries",
      description: "My Walmart",
      bankDescription: WALMART,
    });

    expect((await patch(id, { categoryId: uncategorized })).status).toBe(200);
    expect(await aliases()).toEqual([
      expect.objectContaining({
        merchantKey,
        displayName: "My Walmart",
        categoryId: groceries,
        source: "user",
      }),
    ]);
  });

  it("refreshes an ai alias and leaves a user alias in place", async () => {
    const groceries = crypto.randomUUID();
    const dining = crypto.randomUUID();
    await seedFinancialCategory(db(), { id: groceries, householdId, name: "Groceries" });
    await seedFinancialCategory(db(), { id: dining, householdId, name: "Dining" });
    await db().insert(merchantAliases).values([
      {
        householdId,
        merchantKey: "USER MART",
        displayName: "User name",
        categoryId: groceries,
        source: "user" as const,
      },
      {
        householdId,
        merchantKey: "AI MART",
        displayName: "Old AI",
        categoryId: groceries,
        source: "ai" as const,
      },
    ]);

    await upsertAiAlias(db(), householdId, "USER MART", {
      displayName: "AI name",
      categoryId: dining,
    });
    await upsertAiAlias(db(), householdId, "AI MART", {
      displayName: "New AI",
      categoryId: dining,
    });

    const stored = await aliases();
    expect(stored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          merchantKey: "USER MART",
          displayName: "User name",
          categoryId: groceries,
          source: "user",
        }),
        expect.objectContaining({
          merchantKey: "AI MART",
          displayName: "New AI",
          categoryId: dining,
          source: "ai",
        }),
      ])
    );
    expect(stored).toHaveLength(2);
  });

  it("ignores another household's alias for the same merchant key", async () => {
    const otherHouseholdId = crypto.randomUUID();
    const otherOwnerId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const otherCategoryId = crypto.randomUUID();
    await seedHouseholdWithOwner(db(), {
      householdId: otherHouseholdId,
      ownerId: otherOwnerId,
      ownerAuthId: crypto.randomUUID(),
    });
    await seedFinancialCategory(db(), {
      id: otherCategoryId,
      householdId: otherHouseholdId,
      name: "Their groceries",
    });
    await db().insert(financialAccounts).values({
      id: accountId,
      householdId,
      userId: ownerId,
      name: "Test card",
      type: "CREDIT",
      balance: 0,
      currency: "CAD",
    });
    await db().insert(merchantAliases).values({
      householdId: otherHouseholdId,
      merchantKey: cleanBankDescription(WALMART, "en").merchantKey,
      displayName: "Their Walmart",
      categoryId: otherCategoryId,
      source: "user",
    });

    const preview = (await (
      await handleTransactionsRequest({
        env: getIntegrationEnv(),
        params: { "*": "import" },
        request: new Request("http://localhost/api/transactions/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ofx: statement(
              transaction("walmart").replace(
                "<NAME>Café &amp; market",
                `<NAME>${WALMART}`
              )
            ),
            accountId,
            dryRun: true,
          }),
        }),
        session: testSession({ userId: ownerId, householdId }),
        sessionStatus: "authenticated",
        loadContext: {} as never,
      })
    ).json()) as {
      rows: {
        description: string | null;
        categoryId: string | null;
        categorySource: string;
        nameSource: string;
      }[];
    };

    expect(preview.rows[0]).toMatchObject({
      description: "Wal-Mart",
      categoryId: null,
      categorySource: "none",
      nameSource: "none",
    });
    expect(await aliases()).toEqual([]);
  });
});
