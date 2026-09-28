import {
  and,
  eq,
  exchangeRates,
  inArray,
  scopeToHousehold,
  transactions,
} from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { sqlTransactionAmountHomeCents } from "./money";
import { refreshHouseholdHomeCurrencyRates } from "./home-currency-refresh";
import { todayInTz } from "./dates";
import {
  createTestDb,
  seedExpenseTransaction,
  seedHouseholdWithOwner,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

// USD 40.00 at a 1.35 market rate is CA$54.00; the card charged CA$55.35.
const USD_AMOUNT = 4000;
const USD_RATE = 1.35;
const CHARGED_CAD = 5535;

describe("transaction charged amount", () => {
  let householdId: string;
  let ownerId: string;
  let chargedId: string;
  let marketId: string;
  let homeId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-charged-${suffix}`;
    ownerId = `user-charged-${suffix}`;
    chargedId = `tx-charged-${suffix}`;
    marketId = `tx-market-${suffix}`;
    homeId = `tx-home-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_charged_${suffix}`,
    });
    for (const id of [chargedId, marketId, homeId]) {
      await seedExpenseTransaction(db, {
        id,
        householdId,
        userId: ownerId,
        amount: id === homeId ? 1000 : USD_AMOUNT,
        category: "Travel",
      });
    }
    await db
      .update(transactions)
      .set({ currency: "USD", exchangeRateToHome: USD_RATE })
      .where(
        and(
          scopeToHousehold(transactions.householdId, householdId),
          inArray(transactions.id, [chargedId, marketId])
        )
      );
    await db
      .update(transactions)
      .set({ chargedAmount: CHARGED_CAD, chargedCurrency: "CAD" })
      .where(
        and(
          scopeToHousehold(transactions.householdId, householdId),
          eq(transactions.id, chargedId)
        )
      );
  });

  async function homeCentsById() {
    const db = createTestDb(getIntegrationEnv().DB);
    const rows = await db
      .select({ id: transactions.id, home: sqlTransactionAmountHomeCents() })
      .from(transactions)
      .where(scopeToHousehold(transactions.householdId, householdId))
      .all();
    return new Map(rows.map((row) => [row.id, row.home]));
  }

  async function loadRow(id: string) {
    const db = createTestDb(getIntegrationEnv().DB);
    return db.query.transactions.findFirst({
      where: and(
        scopeToHousehold(transactions.householdId, householdId),
        eq(transactions.id, id)
      ),
    });
  }

  async function seedTodayRates(
    rows: Array<{ baseCurrency: "USD" | "CAD"; targetCurrency: "CAD" | "USD" | "MXN"; rate: number }>
  ) {
    const db = createTestDb(getIntegrationEnv().DB);
    const date = todayInTz("UTC");
    await db
      .insert(exchangeRates)
      .values(rows.map((row) => ({ ...row, date })))
      .onConflictDoNothing();
  }

  it("counts the recorded charge instead of the market conversion", async () => {
    const home = await homeCentsById();
    expect(home.get(chargedId)).toBe(CHARGED_CAD);
    expect(home.get(marketId)).toBe(Math.round(USD_AMOUNT * USD_RATE));
    expect(home.get(homeId)).toBe(1000);
  });

  it("converts a charge in another currency with its own snapshot", async () => {
    const db = createTestDb(getIntegrationEnv().DB);
    await db
      .update(transactions)
      .set({ chargedAmount: 800, chargedCurrency: "USD", chargedExchangeRateToHome: 1.4 })
      .where(
        and(
          scopeToHousehold(transactions.householdId, householdId),
          eq(transactions.id, homeId)
        )
      );
    expect((await homeCentsById()).get(homeId)).toBe(1120);
  });

  it("keeps the charge and re-snapshots its rate when the home currency changes", async () => {
    const env = getIntegrationEnv();
    const db = createTestDb(env.DB);
    await seedTodayRates([
      { baseCurrency: "USD", targetCurrency: "MXN", rate: 17.2 },
      { baseCurrency: "CAD", targetCurrency: "MXN", rate: 12.7 },
    ]);

    await refreshHouseholdHomeCurrencyRates(env, db, householdId, "MXN");

    const charged = await loadRow(chargedId);
    const market = await loadRow(marketId);
    const home = await loadRow(homeId);
    expect(charged).toMatchObject({ chargedAmount: CHARGED_CAD, chargedCurrency: "CAD" });
    // The CAD charge gets the same CAD → MXN snapshot as the CAD row.
    expect(charged!.chargedExchangeRateToHome).toBe(home!.exchangeRateToHome);
    expect(market!.chargedExchangeRateToHome).toBeNull();
    expect((await homeCentsById()).get(chargedId)).toBe(
      Math.round(CHARGED_CAD * home!.exchangeRateToHome!)
    );
  });

  it("returns to the exact charge when the home currency changes back", async () => {
    const env = getIntegrationEnv();
    const db = createTestDb(env.DB);
    await seedTodayRates([
      { baseCurrency: "CAD", targetCurrency: "USD", rate: 0.74 },
      { baseCurrency: "USD", targetCurrency: "CAD", rate: USD_RATE },
    ]);

    await refreshHouseholdHomeCurrencyRates(env, db, householdId, "USD");
    const whileUsd = await loadRow(chargedId);
    expect(whileUsd!.exchangeRateToHome).toBeNull();
    expect(whileUsd!.chargedExchangeRateToHome).toBeGreaterThan(0);

    await refreshHouseholdHomeCurrencyRates(env, db, householdId, "CAD");
    const back = await loadRow(chargedId);
    expect(back).toMatchObject({
      chargedAmount: CHARGED_CAD,
      chargedCurrency: "CAD",
      chargedExchangeRateToHome: null,
    });
    expect((await homeCentsById()).get(chargedId)).toBe(CHARGED_CAD);
  });
});
