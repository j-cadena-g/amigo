import { and, eq, financialAccounts, getDb, scopeToHousehold, transactions } from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleTransactionsRequest } from "./transactions";
import {
  createTestDb,
  seedFinancialCategory,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("transactions account link", () => {
  let householdId: string;
  let ownerId: string;
  let categoryId: string;
  let incomeCategoryId: string;
  let cardId: string;
  let convertedId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-txn-acct-${suffix}`;
    ownerId = `user-txn-acct-${suffix}`;
    categoryId = crypto.randomUUID();
    incomeCategoryId = crypto.randomUUID();
    cardId = crypto.randomUUID();
    // The asset-convert endpoint made ids like this, which are not uuids.
    convertedId = `from-asset-${crypto.randomUUID()}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_txn_acct_${suffix}`,
    });
    await seedFinancialCategory(db, { id: categoryId, householdId, name: "Dining" });
    await seedFinancialCategory(db, {
      id: incomeCategoryId,
      householdId,
      name: "Refunds",
      type: "income",
    });
    await db.insert(financialAccounts).values([
      {
        id: cardId,
        householdId,
        userId: ownerId,
        name: "Visa",
        type: "CREDIT",
        balance: -25000,
        currency: "CAD",
      },
      {
        id: convertedId,
        householdId,
        userId: null,
        name: "Cabin",
        type: "PROPERTY",
        balance: 30000000,
        currency: "CAD",
      },
    ]);
  });

  function call(method: "GET" | "POST" | "PATCH", body?: unknown, id?: string, query = "") {
    return handleTransactionsRequest({
      env: getIntegrationEnv(),
      params: { "*": id ?? "" },
      request: new Request(`http://localhost/api/transactions${id ? `/${id}` : ""}${query}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
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
      ...extra,
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string };
  }

  async function storedAccountId(id: string) {
    const row = await getDb(getIntegrationEnv().DB).query.transactions.findFirst({
      where: and(
        scopeToHousehold(transactions.householdId, householdId),
        eq(transactions.id, id)
      ),
    });
    return row?.accountId;
  }

  it("stores a credit card on create and moves it on update", async () => {
    const { id } = await create({ accountId: cardId });
    expect(await storedAccountId(id)).toBe(cardId);

    await call("PATCH", { accountId: convertedId }, id);
    expect(await storedAccountId(id)).toBe(convertedId);

    await call("PATCH", { accountId: null }, id);
    expect(await storedAccountId(id)).toBeNull();
  });

  it("accepts an account id that is not a uuid", async () => {
    const { id } = await create({ accountId: convertedId });
    expect(await storedAccountId(id)).toBe(convertedId);
  });

  it("rejects another household's account and an empty id", async () => {
    const suffix = crypto.randomUUID();
    const otherHouseholdId = `hh-txn-acct-other-${suffix}`;
    const otherAccountId = `from-asset-${crypto.randomUUID()}`;
    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId: otherHouseholdId,
      ownerId: `user-txn-acct-other-${suffix}`,
      ownerAuthId: `clerk_txn_acct_other_${suffix}`,
    });
    await db.insert(financialAccounts).values({
      id: otherAccountId,
      householdId: otherHouseholdId,
      name: "Elsewhere",
      type: "CREDIT",
    });

    await expect(create({ accountId: otherAccountId })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    const { id } = await create();
    await expect(call("PATCH", { accountId: otherAccountId }, id)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(create({ accountId: "" })).rejects.toThrow();
  });

  it("lists only the transactions of the account in the account filter", async () => {
    const onCard = await create({ accountId: cardId });
    const onCardToo = await create({ accountId: cardId, type: "income", categoryId: incomeCategoryId });
    await create({ accountId: convertedId });
    await create();

    const all = (await (await call("GET")).json()) as { data: { id: string }[] };
    expect(all.data).toHaveLength(4);

    const filtered = (await (await call("GET", undefined, undefined, `?account=${cardId}`)).json()) as {
      data: { id: string; accountId: string }[];
    };
    expect(filtered.data.map((t) => t.id).sort()).toEqual([onCard.id, onCardToo.id].sort());

    const both = (await (
      await call("GET", undefined, undefined, `?account=${cardId}&type=income`)
    ).json()) as { data: { id: string }[] };
    expect(both.data.map((t) => t.id)).toEqual([onCardToo.id]);
  });
});
