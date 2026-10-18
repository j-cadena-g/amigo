import type { D1Migration } from "cloudflare:test";
import { eq, financialAccounts, getDb, inArray } from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleDashboardRequest } from "./dashboard";
import { createTestDb, seedHouseholdWithOwner, testSession } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

/**
 * 0036 re-runs the 0025 copy of debts and assets into financial_accounts, then drops both
 * tables. The test DB already ran every migration, so the legacy tables are recreated here
 * from their 0000 DDL to stand in for a database the old Worker wrote to after 0025.
 */
function migrations(): D1Migration[] {
  return (getIntegrationEnv() as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS;
}

function findMigration(nameIncludes: string): D1Migration {
  const migration = migrations().find((m) => m.name.includes(nameIncludes));
  if (!migration) throw new Error(`${nameIncludes} migration not found in TEST_MIGRATIONS`);
  return migration;
}

async function recreateLegacyTables() {
  const d1 = getIntegrationEnv().DB;
  const ddl = findMigration("0000_").queries.filter(
    (q) => q.includes("CREATE TABLE `debts`") || q.includes("CREATE TABLE `assets`")
  );
  expect(ddl).toHaveLength(2);
  for (const query of ddl) await d1.prepare(query).run();
}

async function runMigration() {
  const d1 = getIntegrationEnv().DB;
  for (const query of findMigration("drop_debts_and_assets").queries) {
    await d1.prepare(query).run();
  }
}

async function legacyTables() {
  const { results } = await getIntegrationEnv()
    .DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('debts', 'assets')")
    .all<{ name: string }>();
  return results.map((r) => r.name);
}

describe("0036 drop debts and assets", () => {
  let householdId: string;
  let ownerId: string;
  let ids: {
    lateCard: string;
    copiedLoan: string;
    deletedDebt: string;
    lateBank: string;
    deletedAsset: string;
    halfConverted: string;
    halfConvertedAccount: string;
  };

  const db = () => getDb(getIntegrationEnv().DB);
  const createdAt = new Date("2025-03-01T12:00:00Z");
  const deletedAt = new Date("2025-06-01T12:00:00Z");

  async function insertDebt(row: {
    id: string;
    userId: string | null;
    name: string;
    type: "CREDIT_CARD" | "LOAN";
    balanceInitial: number;
    balanceCurrent: number;
    currency: string;
    exchangeRateToHome?: number;
    deletedAt?: Date;
  }) {
    await getIntegrationEnv()
      .DB.prepare(
        `INSERT INTO debts (id, household_id, user_id, name, type, balance_initial, balance_current,
          currency, exchange_rate_to_home, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        row.id,
        householdId,
        row.userId,
        row.name,
        row.type,
        row.balanceInitial,
        row.balanceCurrent,
        row.currency,
        row.exchangeRateToHome ?? null,
        createdAt.getTime(),
        createdAt.getTime(),
        row.deletedAt?.getTime() ?? null
      )
      .run();
  }

  async function insertAsset(row: {
    id: string;
    name: string;
    type: "BANK" | "INVESTMENT" | "CASH" | "PROPERTY";
    balance: number;
    deletedAt?: Date;
  }) {
    await getIntegrationEnv()
      .DB.prepare(
        `INSERT INTO assets (id, household_id, user_id, name, type, balance, currency,
          created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, 'CAD', ?, ?, ?)`
      )
      .bind(
        row.id,
        householdId,
        ownerId,
        row.name,
        row.type,
        row.balance,
        createdAt.getTime(),
        createdAt.getTime(),
        row.deletedAt?.getTime() ?? null
      )
      .run();
  }

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-drop-${suffix}`;
    ownerId = `user-drop-owner-${suffix}`;
    ids = {
      lateCard: `debt-card-${suffix}`,
      copiedLoan: `debt-loan-${suffix}`,
      deletedDebt: `debt-deleted-${suffix}`,
      lateBank: `asset-bank-${suffix}`,
      deletedAsset: `asset-deleted-${suffix}`,
      halfConverted: `asset-half-${suffix}`,
      halfConvertedAccount: `from-asset-asset-half-${suffix}`,
    };

    await seedHouseholdWithOwner(createTestDb(getIntegrationEnv().DB), {
      householdId,
      ownerId,
      ownerAuthId: `clerk_drop_owner_${suffix}`,
    });
    await recreateLegacyTables();

    // Written by the old Worker after 0025 ran, so never copied.
    await insertDebt({
      id: ids.lateCard,
      userId: ownerId,
      name: "Visa",
      type: "CREDIT_CARD",
      balanceInitial: 500000,
      balanceCurrent: 380000,
      currency: "CAD",
    });
    // Copied by 0025 and edited since: the account must keep its newer balance.
    await insertDebt({
      id: ids.copiedLoan,
      userId: null,
      name: "Car loan",
      type: "LOAN",
      balanceInitial: 1200000,
      balanceCurrent: 400000,
      currency: "USD",
      exchangeRateToHome: 1.35,
    });
    await db().insert(financialAccounts).values({
      id: ids.copiedLoan,
      householdId,
      userId: null,
      name: "Car loan",
      type: "LOAN",
      balance: -700000,
      originalAmount: 1200000,
      currency: "USD",
      exchangeRateToHome: 1.35,
    });
    await insertDebt({
      id: ids.deletedDebt,
      userId: ownerId,
      name: "Old card",
      type: "CREDIT_CARD",
      balanceInitial: 100000,
      balanceCurrent: 0,
      currency: "CAD",
      deletedAt,
    });

    await insertAsset({ id: ids.lateBank, name: "Chequing", type: "BANK", balance: 250000 });
    await insertAsset({
      id: ids.deletedAsset,
      name: "Sold car",
      type: "CASH",
      balance: 900000,
      deletedAt,
    });
    await insertAsset({ id: ids.halfConverted, name: "Half converted", type: "CASH", balance: 70000 });
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

  it("copies rows 0025 missed, keeps copied accounts as edited, then drops both tables", async () => {
    await runMigration();

    expect(await legacyTables()).toEqual([]);

    const all = await db()
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.householdId, householdId));
    expect(all.map((a) => a.id).sort()).toEqual(
      [ids.lateCard, ids.copiedLoan, ids.deletedDebt, ids.lateBank, ids.halfConvertedAccount].sort()
    );

    const [card] = await accountsByIds([ids.lateCard]);
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

    const [loan] = await accountsByIds([ids.copiedLoan]);
    expect(loan).toMatchObject({ type: "LOAN", balance: -700000, originalAmount: 1200000 });

    const [deletedDebt] = await accountsByIds([ids.deletedDebt]);
    expect(deletedDebt).toMatchObject({ type: "CREDIT", balance: -100000, creditLimit: 100000 });
    expect(deletedDebt!.deletedAt).toEqual(deletedAt);

    const [bank] = await accountsByIds([ids.lateBank]);
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
  });

  it("gives the dashboard net worth from the accounts alone", async () => {
    await runMigration();

    // Assets: checking 2,500.00 + converted cash 700.00. Debts: card 1,200.00 + loan 7,000.00 USD at 1.35.
    expect(await loadDashboard()).toMatchObject({
      assetsCents: 250000 + 70000,
      debtsCents: 120000 + 945000,
      netWorthCents: 250000 + 70000 - 120000 - 945000,
    });
  });
});
