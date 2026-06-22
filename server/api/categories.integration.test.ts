import {
  and,
  eq,
  financialCategories,
  getDb,
  isNull,
  seedStarterFinancialCategories,
  transactions,
} from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCategoriesRequest } from "./categories";
import { handleTransactionsRequest } from "./transactions";
import { todayInTz } from "../lib/dates";
import {
  createTestDb,
  seedFinancialCategory,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("categories integration", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-categories-${suffix}`;
    ownerId = `user-categories-owner-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_categories_owner_${suffix}`,
    });
  });

  it("seeds starter categories for an empty household", async () => {
    const env = getIntegrationEnv();
    const session = testSession({ userId: ownerId, householdId });

    const response = await handleCategoriesRequest({
      env,
      params: {},
      request: new Request("http://localhost/api/categories"),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    const categories = (await response.json()) as { name: string }[];
    expect(categories.map((category) => category.name).sort()).toEqual([
      "Groceries",
      "Living expenses",
      "Subscriptions",
    ]);
  });

  it("does not seed starters when the household already has custom categories", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    await seedFinancialCategory(db, {
      id: `cat-food-${crypto.randomUUID()}`,
      householdId,
      name: "Food",
    });

    const seeded = await seedStarterFinancialCategories(db, householdId);
    expect(seeded).toEqual([]);

    const rows = await db.query.financialCategories.findMany({
      where: and(
        eq(financialCategories.householdId, householdId),
        isNull(financialCategories.deletedAt)
      ),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Food");
  });

  it("does not seed root starters when only starter-named subcategories exist", async () => {
    const env = getIntegrationEnv();
    const db = getDb(env.DB);
    const parentId = `cat-food-${crypto.randomUUID()}`;

    await seedFinancialCategory(db, {
      id: parentId,
      householdId,
      name: "Food",
    });
    await seedFinancialCategory(db, {
      id: `cat-groceries-sub-${crypto.randomUUID()}`,
      householdId,
      name: "Groceries",
      parentId,
    });

    const seeded = await seedStarterFinancialCategories(db, householdId);
    expect(seeded).toEqual([]);

    const rows = await db.query.financialCategories.findMany({
      where: and(
        eq(financialCategories.householdId, householdId),
        isNull(financialCategories.deletedAt),
        isNull(financialCategories.parentId)
      ),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Food");
  });

  it("does not re-seed starter categories after one is hard-deleted", async () => {
    const env = getIntegrationEnv();
    const session = testSession({ userId: ownerId, householdId });
    const db = getDb(env.DB);

    await handleCategoriesRequest({
      env,
      params: {},
      request: new Request("http://localhost/api/categories"),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    const subscriptions = await db.query.financialCategories.findFirst({
      where: and(
        eq(financialCategories.householdId, householdId),
        eq(financialCategories.name, "Subscriptions"),
        isNull(financialCategories.deletedAt)
      ),
    });
    expect(subscriptions).toBeDefined();

    const deleteResponse = await handleCategoriesRequest({
      env,
      params: { "*": subscriptions!.id },
      request: new Request(`http://localhost/api/categories/${subscriptions!.id}`, {
        method: "DELETE",
      }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
    expect(deleteResponse.status).toBe(200);

    const seeded = await seedStarterFinancialCategories(db, householdId);
    expect(seeded).toEqual([]);

    const remaining = await db.query.financialCategories.findMany({
      where: and(
        eq(financialCategories.householdId, householdId),
        isNull(financialCategories.deletedAt),
        isNull(financialCategories.parentId)
      ),
      orderBy: (category, { asc }) => [asc(category.name)],
    });
    expect(remaining.map((category) => category.name)).toEqual([
      "Groceries",
      "Living expenses",
    ]);
  });

  it("returns a validation error when concurrent creates race on the same name", async () => {
    const env = getIntegrationEnv();
    const session = testSession({ userId: ownerId, householdId });

    const createCategory = () =>
      handleCategoriesRequest({
        env,
        params: {},
        request: new Request("http://localhost/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Dining", type: "expense" }),
        }),
        session,
        sessionStatus: "authenticated",
        loadContext: {} as never,
      });

    const results = await Promise.allSettled([
      createCategory(),
      createCategory(),
    ]);

    const successes = results.filter(
      (result): result is PromiseFulfilledResult<Response> => result.status === "fulfilled"
    );
    const failures = results.filter((result) => result.status === "rejected");

    expect(successes).toHaveLength(1);
    expect(successes[0]?.value.status).toBe(201);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        code: "VALIDATION_ERROR",
        message: "A category with this name already exists",
      }),
    });

    const db = getDb(env.DB);
    const rows = await db.query.financialCategories.findMany({
      where: and(
        eq(financialCategories.householdId, householdId),
        isNull(financialCategories.deletedAt)
      ),
    });
    expect(rows.filter((row) => row.name === "Dining")).toHaveLength(1);
  });

  it("returns a validation error when concurrent renames race on the same name", async () => {
    const env = getIntegrationEnv();
    const session = testSession({ userId: ownerId, householdId });
    const db = getDb(env.DB);
    const diningId = `cat-dining-${crypto.randomUUID()}`;
    const travelId = `cat-travel-${crypto.randomUUID()}`;

    await seedFinancialCategory(db, {
      id: diningId,
      householdId,
      name: "Dining",
    });
    await seedFinancialCategory(db, {
      id: travelId,
      householdId,
      name: "Travel",
    });

    const renameCategory = (categoryId: string) =>
      handleCategoriesRequest({
        env,
        params: { "*": categoryId },
        request: new Request(`http://localhost/api/categories/${categoryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Merged" }),
        }),
        session,
        sessionStatus: "authenticated",
        loadContext: {} as never,
      });

    const results = await Promise.allSettled([
      renameCategory(diningId),
      renameCategory(travelId),
    ]);

    const successes = results.filter(
      (result): result is PromiseFulfilledResult<Response> => result.status === "fulfilled"
    );
    const failures = results.filter((result) => result.status === "rejected");

    expect(successes).toHaveLength(1);
    expect(successes[0]?.value.status).toBe(200);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        code: "VALIDATION_ERROR",
        message: "A category with this name already exists",
      }),
    });

    const rows = await db.query.financialCategories.findMany({
      where: and(
        eq(financialCategories.householdId, householdId),
        isNull(financialCategories.deletedAt),
        eq(financialCategories.name, "Merged")
      ),
    });
    expect(rows).toHaveLength(1);
  });

  it("reuses an archived category name during transaction import", async () => {
    const env = getIntegrationEnv();
    const session = testSession({ userId: ownerId, householdId });
    const categoryId = `cat-groceries-${crypto.randomUUID()}`;

    const db = getDb(env.DB);
    await seedFinancialCategory(db, {
      id: categoryId,
      householdId,
      name: "Groceries",
      type: "expense",
    });

    const archiveResponse = await handleCategoriesRequest({
      env,
      params: { "*": categoryId },
      request: new Request(`http://localhost/api/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
    expect(archiveResponse.status).toBe(200);

    const today = todayInTz("UTC");
    const importResponse = await handleTransactionsRequest({
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
              amount: 4.5,
              externalId: "ext-archived-category",
            },
          ],
          dryRun: false,
        }),
      }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(importResponse.status).toBe(201);

    const imported = await db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.externalId, "ext-archived-category"),
          isNull(transactions.deletedAt)
        )
      )
      .get();

    expect(imported?.categoryId).toBe(categoryId);
  });
});
