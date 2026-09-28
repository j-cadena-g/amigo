import type { D1Migration } from "cloudflare:test";
import { assets, debts, eq, financialAccounts, getDb, inArray } from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleDashboardRequest } from "./dashboard";
import { createTestDb, seedHouseholdWithOwner, testSession } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

/** 0025 copies debts and assets into financial_accounts; the test DB already ran it on empty tables. */
function findMigration(): D1Migration {
  const { TEST_MIGRATIONS } = getIntegrationEnv() as unknown as {
    TEST_MIGRATIONS: D1Migration[];
  };
  const migration = TEST_MIGRATIONS.find((m) => m.name.includes("move_debts_and_assets_to_accounts"));
  if (!migration) throw new Error("0025 migration not found in TEST_MIGRATIONS");
  return migration;
}

async function runMigration() {
  const d1 = getIntegrationEnv().DB;
  for (const query of findMigration().queries) {
    await d1.prepare(query).run();
  }
}

describe("0025 move debts and assets to accounts", () => {
  let householdId: string;
  let ownerId: string;
  let ids: {
    card: string;
    loan: string;
    deletedDebt: string;
    bank: string;
    deletedAsset: string;
    halfConverted: string;
    halfConvertedAccount: string;
  };

  const db = () => getDb(getIntegrationEnv().DB);
  const createdAt = new Date("2025-03-01T12:00:00Z");
  const deletedAt = new Date("2025-06-01T12:00:00Z");

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-move-${suffix}`;
    ownerId = `user-move-owner-${suffix}`;
    ids = {
      card: `debt-card-${suffix}`,
      loan: `debt-loan-${suffix}`,
      deletedDebt: `debt-deleted-${suffix}`,
      bank: `asset-bank-${suffix}`,
      deletedAsset: `asset-deleted-${suffix}`,
      halfConverted: `asset-half-${suffix}`,
      halfConvertedAccount: `from-asset-asset-half-${suffix}`,
    };

    await seedHouseholdWithOwner(createTestDb(getIntegrationEnv().DB), {
      householdId,
      ownerId,
      ownerAuthId: `clerk_move_owner_${suffix}`,
    });

    await db().insert(debts).values([
      {
        id: ids.card,
        householdId,
        userId: ownerId,
        name: "Visa",
        type: "CREDIT_CARD",
        balanceInitial: 500000,
        balanceCurrent: 380000,
        currency: "CAD",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: ids.loan,
        householdId,
        userId: null,
        name: "Car loan",
        type: "LOAN",
        balanceInitial: 1200000,
        balanceCurrent: 400000,
        currency: "USD",
        exchangeRateToHome: 1.35,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: ids.deletedDebt,
        householdId,
        userId: ownerId,
        name: "Old card",
        type: "CREDIT_CARD",
        balanceInitial: 100000,
        balanceCurrent: 0,
        currency: "CAD",
        createdAt,
        updatedAt: createdAt,
        deletedAt,
      },
    ]);

    await db().insert(assets).values([
      {
        id: ids.bank,
        householdId,
        userId: ownerId,
        name: "Chequing",
        type: "BANK",
        balance: 250000,
        currency: "CAD",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: ids.deletedAsset,
        householdId,
        userId: ownerId,
        name: "Sold car",
        type: "CASH",
        balance: 900000,
        currency: "CAD",
        createdAt,
        updatedAt: createdAt,
        deletedAt,
      },
      {
        id: ids.halfConverted,
        householdId,
        userId: ownerId,
        name: "Half converted",
        type: "CASH",
        balance: 70000,
        currency: "CAD",
        createdAt,
        updatedAt: createdAt,
      },
    ]);
    // The convert endpoint already made this account but never retired the asset.
    await db().insert(financialAccounts).values({
      id: ids.halfConvertedAccount,
      householdId,
      userId: ownerId,
      name: "Half converted",
      type: "CASH",
      balance: 70000,
      currency: "CAD",
    });
  });

  async function accountsByIds(accountIds: string[]) {
    return db().select().from(financialAccounts).where(inArray(financialAccounts.id, accountIds));
  }

  async function loadDashboard() {
    const env = getIntegrationEnv();
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
  }

  it("copies debts and live assets into accounts, and is safe to run twice", async () => {
    await runMigration();
    await runMigration();

    const all = await db()
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.householdId, householdId));
    expect(all.map((a) => a.id).sort()).toEqual(
      [ids.card, ids.loan, ids.deletedDebt, ids.bank, ids.halfConvertedAccount].sort()
    );

    const [card] = await accountsByIds([ids.card]);
    expect(card).toMatchObject({
      type: "CREDIT",
      name: "Visa",
      userId: ownerId,
      balance: -120000,
      creditLimit: 500000,
      originalAmount: null,
      currency: "CAD",
      exchangeRateToHome: null,
      archived: false,
      deletedAt: null,
    });
    expect(card!.createdAt).toEqual(createdAt);

    const [loan] = await accountsByIds([ids.loan]);
    expect(loan).toMatchObject({
      type: "LOAN",
      name: "Car loan",
      userId: null,
      balance: -800000,
      originalAmount: 1200000,
      creditLimit: null,
      currency: "USD",
      exchangeRateToHome: 1.35,
      deletedAt: null,
    });
    expect(loan!.createdAt).toEqual(createdAt);

    const [deletedDebt] = await accountsByIds([ids.deletedDebt]);
    expect(deletedDebt).toMatchObject({ type: "CREDIT", balance: -100000, creditLimit: 100000 });
    expect(deletedDebt!.deletedAt).toEqual(deletedAt);

    const [bank] = await accountsByIds([ids.bank]);
    expect(bank).toMatchObject({
      type: "CHECKING",
      name: "Chequing",
      userId: ownerId,
      balance: 250000,
      creditLimit: null,
      originalAmount: null,
      deletedAt: null,
    });

    // Soft-deleted assets are not copied; an asset whose convert account exists is not copied again.
    expect(await accountsByIds([ids.deletedAsset, ids.halfConverted])).toEqual([]);

    // Copied and half-converted assets are retired; already-deleted ones keep their timestamp.
    const assetRows = await db()
      .select()
      .from(assets)
      .where(inArray(assets.id, [ids.bank, ids.halfConverted, ids.deletedAsset]));
    expect(assetRows).toHaveLength(3);
    for (const row of assetRows) expect(row.deletedAt).not.toBeNull();
    expect(assetRows.find((a) => a.id === ids.deletedAsset)!.deletedAt).toEqual(deletedAt);

    // debts stay as they were.
    const debtRows = await db().select().from(debts).where(eq(debts.householdId, householdId));
    expect(debtRows).toHaveLength(3);
    expect(debtRows.filter((d) => d.deletedAt === null)).toHaveLength(2);
  });

  it("gives the dashboard the same net worth from accounts alone", async () => {
    await runMigration();

    // Assets: checking 2,500.00 + converted cash 700.00. Debts: card 1,200.00 + loan 8,000.00 USD at 1.35.
    expect(await loadDashboard()).toMatchObject({
      assetsCents: 250000 + 70000,
      debtsCents: 120000 + 1080000,
      netWorthCents: 250000 + 70000 - 120000 - 1080000,
    });
  });
});
