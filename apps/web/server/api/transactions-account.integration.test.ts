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
  let bankId: string;
  let loanId: string;
  let convertedId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-txn-acct-${suffix}`;
    ownerId = `user-txn-acct-${suffix}`;
    categoryId = crypto.randomUUID();
    incomeCategoryId = crypto.randomUUID();
    cardId = crypto.randomUUID();
    bankId = crypto.randomUUID();
    loanId = crypto.randomUUID();
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
        id: bankId,
        householdId,
        userId: null,
        name: "Chequing",
        type: "CHECKING",
        balance: 100000,
        currency: "CAD",
      },
      {
        id: loanId,
        householdId,
        userId: null,
        name: "Car loan",
        type: "LOAN",
        balance: -800000,
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

  function call(
    method: "GET" | "POST" | "PATCH",
    body?: unknown,
    id?: string,
    query = "",
    path = id,
    env = getIntegrationEnv()
  ) {
    return handleTransactionsRequest({
      env,
      params: { "*": path ?? "" },
      request: new Request(`http://localhost/api/transactions${path ? `/${path}` : ""}${query}`, {
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

    await call("PATCH", { accountId: bankId }, id);
    expect(await storedAccountId(id)).toBe(bankId);

    await call("PATCH", { accountId: null }, id);
    expect(await storedAccountId(id)).toBeNull();
  });

  it("accepts an account id that is not a uuid", async () => {
    const { id } = await create({
      accountId: convertedId,
      type: "income",
      categoryId: incomeCategoryId,
    });
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
    await create({ accountId: bankId });
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

  const expenseAccountError = {
    code: "VALIDATION_ERROR",
    message: expect.stringMatching(/^Expenses can only use/),
  };

  it("keeps new expenses off loan and asset accounts", async () => {
    await expect(create({ accountId: loanId })).rejects.toMatchObject(expenseAccountError);
    await expect(create({ accountId: convertedId })).rejects.toMatchObject(expenseAccountError);

    const { id } = await create({ accountId: bankId });
    await expect(call("PATCH", { accountId: loanId }, id)).rejects.toMatchObject(
      expenseAccountError
    );
    expect(await storedAccountId(id)).toBe(bankId);

    const onLoan = await create({
      type: "income",
      categoryId: incomeCategoryId,
      accountId: loanId,
    });
    expect(await storedAccountId(onLoan.id)).toBe(loanId);
    await expect(
      call("PATCH", { type: "expense", categoryId }, onLoan.id)
    ).rejects.toMatchObject(expenseAccountError);
    await call("PATCH", { type: "expense", categoryId, accountId: cardId }, onLoan.id);
    expect(await storedAccountId(onLoan.id)).toBe(cardId);
  });

  it("lets a saved expense keep a loan account while it is edited", async () => {
    const id = crypto.randomUUID();
    await createTestDb(getIntegrationEnv().DB).insert(transactions).values({
      id,
      householdId,
      userId: ownerId,
      amount: 4000,
      currency: "CAD",
      categoryId,
      category: "Dining",
      type: "expense",
      date: "2026-09-01",
      accountId: loanId,
    });

    const response = await call(
      "PATCH",
      { amount: 45, type: "expense", categoryId, accountId: loanId },
      id
    );
    expect(response.status).toBe(200);
    expect(await storedAccountId(id)).toBe(loanId);
  });

  /** An env whose first write to `transactions` runs `race` just before it. */
  function racingEnv(race: () => Promise<unknown>) {
    const env = getIntegrationEnv();
    let fired = false;
    const wrap = (stmt: D1PreparedStatement): D1PreparedStatement =>
      new Proxy(stmt, {
        get(target, prop) {
          const value = Reflect.get(target, prop) as unknown;
          if (typeof value !== "function") return value;
          if (prop === "bind") {
            return (...args: unknown[]) => wrap(target.bind(...args));
          }
          return async (...args: unknown[]) => {
            await race();
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      });
    const DB = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "prepare") {
          return (sql: string) => {
            const stmt = target.prepare(sql);
            if (fired || !/^update "transactions"/i.test(sql)) return stmt;
            fired = true;
            return wrap(stmt);
          };
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return { ...env, DB };
  }

  it("rejects an account edit when a concurrent edit changed the type it was checked for", async () => {
    const income = await create({ type: "income", categoryId: incomeCategoryId });
    const env = racingEnv(() =>
      getDb(getIntegrationEnv().DB)
        .update(transactions)
        .set({ type: "expense", categoryId })
        .where(eq(transactions.id, income.id))
    );

    await expect(
      call("PATCH", { accountId: loanId }, income.id, "", income.id, env)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await storedAccountId(income.id)).toBeNull();
  });

  it("rejects a type edit when a concurrent edit changed the account it was checked for", async () => {
    const income = await create({
      type: "income",
      categoryId: incomeCategoryId,
      accountId: bankId,
    });
    const env = racingEnv(() =>
      getDb(getIntegrationEnv().DB)
        .update(transactions)
        .set({ accountId: loanId })
        .where(eq(transactions.id, income.id))
    );

    await expect(
      call("PATCH", { type: "expense", categoryId }, income.id, "", income.id, env)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await storedAccountId(income.id)).toBe(loanId);
  });

  it("rejects imported expense rows on a loan account", async () => {
    const row = { date: "2026-09-01", category: "Dining", amount: 12, accountId: loanId };
    await expect(
      call("POST", { rows: [{ ...row, type: "expense" }] }, undefined, "", "import")
    ).rejects.toMatchObject(expenseAccountError);

    const response = await call(
      "POST",
      { rows: [{ ...row, type: "income", category: "Refunds" }] },
      undefined,
      "",
      "import"
    );
    expect(await response.json()).toMatchObject({ inserted: 1 });
  });
});
