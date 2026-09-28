import { and, eq, exchangeRates, getDb, scopeToHousehold, transactions } from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleTransactionsRequest } from "./transactions";
import { todayInTz } from "../lib/dates";
import {
  createTestDb,
  seedFinancialCategory,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("transactions charged amount", () => {
  let householdId: string;
  let ownerId: string;
  let categoryId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-txn-charged-${suffix}`;
    ownerId = `user-txn-charged-${suffix}`;
    categoryId = crypto.randomUUID();

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_txn_charged_${suffix}`,
    });
    await seedFinancialCategory(db, { id: categoryId, householdId, name: "Travel" });
    // Resolve USD/EUR → CAD from D1 instead of the external rate API.
    await db
      .insert(exchangeRates)
      .values([
        { baseCurrency: "USD", targetCurrency: "CAD", date: todayInTz("UTC"), rate: 1.35 },
        { baseCurrency: "EUR", targetCurrency: "CAD", date: todayInTz("UTC"), rate: 1.5 },
      ])
      .onConflictDoNothing();
  });

  function call(method: "POST" | "PATCH", body: unknown, id?: string) {
    const env = getIntegrationEnv();
    return handleTransactionsRequest({
      env,
      params: { "*": id ?? "" },
      request: new Request(
        `http://localhost/api/transactions${id ? `/${id}` : ""}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      ),
      session: testSession({ userId: ownerId, householdId }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
  }

  async function create(extra: Record<string, unknown> = {}) {
    const response = await call("POST", {
      amount: 40,
      categoryId,
      type: "expense",
      date: "2026-09-01",
      currency: "USD",
      ...extra,
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string; chargedAmount: number | null };
  }

  async function stored(id: string) {
    const db = getDb(getIntegrationEnv().DB);
    return db.query.transactions.findFirst({
      where: and(
        scopeToHousehold(transactions.householdId, householdId),
        eq(transactions.id, id)
      ),
    });
  }

  const CLEARED = {
    chargedAmount: null,
    chargedCurrency: null,
    chargedExchangeRateToHome: null,
  };

  it("stores the charge in home currency cents by default", async () => {
    const created = await create({ chargedAmount: 5535 });
    expect(created.chargedAmount).toBe(5535);
    expect(await stored(created.id)).toMatchObject({
      chargedAmount: 5535,
      chargedCurrency: "CAD",
      chargedExchangeRateToHome: null,
    });
  });

  it("stores a charge in another currency with its FX snapshot", async () => {
    const created = await create({
      currency: "CAD",
      amount: 50,
      chargedAmount: 3800,
      chargedCurrency: "USD",
    });
    expect(await stored(created.id)).toMatchObject({
      chargedAmount: 3800,
      chargedCurrency: "USD",
      chargedExchangeRateToHome: 1.35,
    });
  });

  it("rejects a charge in the transaction's own currency", async () => {
    await expect(
      create({ currency: "CAD", chargedAmount: 4100 })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      create({ chargedAmount: 4100, chargedCurrency: "USD" })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a charge that is not positive integer cents", async () => {
    await expect(create({ chargedAmount: 55.35 })).rejects.toThrow();
    await expect(create({ chargedAmount: 0 })).rejects.toThrow();
  });

  it("rejects a charged currency without a charged amount", async () => {
    await expect(create({ chargedCurrency: "CAD" })).rejects.toThrow();
  });

  it("sets, keeps, and clears the charge on update", async () => {
    const { id } = await create();

    await call("PATCH", { chargedAmount: 5535 }, id);
    expect((await stored(id))?.chargedAmount).toBe(5535);

    // The form resends the same amount and currency with other edits.
    await call("PATCH", { amount: 40, currency: "USD", description: "Hotel" }, id);
    expect((await stored(id))?.chargedAmount).toBe(5535);

    await call("PATCH", { chargedAmount: null }, id);
    expect(await stored(id)).toMatchObject(CLEARED);
  });

  it("keeps the recorded charged currency when only the amount is resent", async () => {
    const { id } = await create({
      currency: "EUR",
      amount: 50,
      chargedAmount: 5800,
      chargedCurrency: "USD",
    });

    await call("PATCH", { chargedAmount: 5900 }, id);
    expect(await stored(id)).toMatchObject({
      chargedAmount: 5900,
      chargedCurrency: "USD",
      chargedExchangeRateToHome: 1.35,
    });
  });

  it("keeps both FX snapshots when the same currency and charge are resent", async () => {
    const { id } = await create({
      currency: "EUR",
      amount: 50,
      chargedAmount: 5800,
      chargedCurrency: "USD",
    });
    const db = getDb(getIntegrationEnv().DB);
    await db
      .update(transactions)
      .set({ chargedExchangeRateToHome: 1.3 })
      .where(
        and(scopeToHousehold(transactions.householdId, householdId), eq(transactions.id, id))
      );

    await db
      .update(transactions)
      .set({ exchangeRateToHome: 1.45 })
      .where(
        and(scopeToHousehold(transactions.householdId, householdId), eq(transactions.id, id))
      );

    // The edit form resends the currency and the charge unchanged.
    await call(
      "PATCH",
      { description: "Hotel", currency: "EUR", chargedAmount: 5800 },
      id
    );
    expect(await stored(id)).toMatchObject({
      exchangeRateToHome: 1.45,
      chargedExchangeRateToHome: 1.3,
    });

    await expect(
      call("PATCH", { currency: "USD", chargedAmount: 5800 }, id)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("clears the charge when the amount changes without a new one", async () => {
    const { id } = await create({ chargedAmount: 5535 });

    await call("PATCH", { amount: 45 }, id);
    expect(await stored(id)).toMatchObject(CLEARED);

    await call("PATCH", { amount: 50, chargedAmount: 6900 }, id);
    expect((await stored(id))?.chargedAmount).toBe(6900);
  });

  it("clears the charge when the currency changes without a new one", async () => {
    const { id } = await create({ chargedAmount: 5535 });

    await call("PATCH", { currency: "EUR" }, id);
    const row = await stored(id);
    expect(row?.currency).toBe("EUR");
    expect(row).toMatchObject(CLEARED);
  });

  it("rejects a charge when the update puts the row in the charge's currency", async () => {
    const { id } = await create();

    await expect(
      call("PATCH", { currency: "CAD", chargedAmount: 4100 }, id)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
