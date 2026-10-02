import {
  and,
  eq,
  financialCategories,
  getDb,
  isNull,
  seedStarterFinancialCategories,
  transactions,
} from "@amigo/db";
import type { LoaderFunctionArgs } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { createRouterLoadContext } from "../../router-context";
import { handleCategoriesRequest } from "./categories";
import { handleApiRoute } from "./route";
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

  it("names starter categories in the household's language", async () => {
    const db = getDb(getIntegrationEnv().DB);
    const seeded = await seedStarterFinancialCategories(db, householdId, async () => "es");
    expect(seeded.map((category) => category.name)).toEqual([
      "Mercado",
      "Gastos del hogar",
      "Suscripciones",
    ]);
    expect(seeded.every((category) => category.description)).toBe(true);
    expect(seeded[1]?.description).toContain("arriendo");
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

  function callCategories(
    method: "GET" | "POST" | "PATCH",
    options?: { id?: string; body?: unknown; householdId?: string; userId?: string }
  ) {
    const id = options?.id;
    return handleCategoriesRequest({
      env: getIntegrationEnv(),
      params: id ? { "*": id } : {},
      request: new Request(`http://localhost/api/categories${id ? `/${id}` : ""}`, {
        method,
        headers:
          options?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      }),
      session: testSession({
        userId: options?.userId ?? ownerId,
        householdId: options?.householdId ?? householdId,
      }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
  }

  it("stores a trimmed description on create and returns it from the list", async () => {
    const createdResponse = await callCategories("POST", {
      body: {
        name: "Housing",
        type: "expense",
        description: "  rent, utilities, phone  ",
      },
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      id: string;
      description: string | null;
    };
    expect(created.description).toBe("rent, utilities, phone");

    const listResponse = await callCategories("GET");
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      id: string;
      description: string | null;
    }[];
    expect(listed.find((category) => category.id === created.id)?.description).toBe(
      "rent, utilities, phone"
    );
  });

  it("stores a blank description as null", async () => {
    const response = await callCategories("POST", {
      body: { name: "Misc", type: "expense", description: "   " },
    });
    expect(response.status).toBe(201);
    const created = (await response.json()) as { description: string | null };
    expect(created.description).toBeNull();

    const padded = await callCategories("POST", {
      body: { name: "Padded", type: "expense", description: " ".repeat(301) },
    });
    expect(padded.status).toBe(201);
    expect(((await padded.json()) as { description: string | null }).description).toBeNull();
  });

  it("sets and clears a description on update", async () => {
    const createdResponse = await callCategories("POST", {
      body: { name: "Transport", type: "expense" },
    });
    const created = (await createdResponse.json()) as {
      id: string;
      description: string | null;
    };
    expect(created.description).toBeNull();

    const setResponse = await callCategories("PATCH", {
      id: created.id,
      body: { description: "  bus and fuel  " },
    });
    expect(setResponse.status).toBe(200);
    expect(((await setResponse.json()) as { description: string | null }).description).toBe(
      "bus and fuel"
    );

    const clearResponse = await callCategories("PATCH", {
      id: created.id,
      body: { description: "  " },
    });
    expect(clearResponse.status).toBe(200);
    expect(((await clearResponse.json()) as { description: string | null }).description).toBeNull();
  });

  it("leaves the description unchanged when a patch omits it", async () => {
    const createdResponse = await callCategories("POST", {
      body: { name: "Phone", type: "expense", description: "mobile plan" },
    });
    const created = (await createdResponse.json()) as { id: string };

    const response = await callCategories("PATCH", {
      id: created.id,
      body: { name: "Mobile" },
    });
    expect(response.status).toBe(200);
    const updated = (await response.json()) as { name: string; description: string | null };
    expect(updated.name).toBe("Mobile");
    expect(updated.description).toBe("mobile plan");
  });

  it("returns a 400 validation error when a description is longer than 300 characters", async () => {
    const tooLong = "x".repeat(301);
    const createdResponse = await callCategories("POST", {
      body: { name: "Bounded", type: "expense", description: "ok" },
    });
    const created = (await createdResponse.json()) as { id: string };

    async function expectValidationError(request: Request, params: Record<string, string> = {}) {
      const response = await handleApiRoute(
        {
          request,
          params,
          context: createRouterLoadContext({
            cloudflare: {
              env: getIntegrationEnv(),
              ctx: {} as ExecutionContext,
              caches: {} as CacheStorage,
            },
            app: {
              cspNonce: "test-nonce",
              sessionStatus: "authenticated",
              session: testSession({ userId: ownerId, householdId }),
            },
          }),
        } as unknown as LoaderFunctionArgs,
        { auth: "none", handler: handleCategoriesRequest }
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "Validation error",
        code: "VALIDATION_ERROR",
      });
    }

    await expectValidationError(
      new Request("http://localhost/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Too long", type: "expense", description: tooLong }),
      })
    );
    await expectValidationError(
      new Request(`http://localhost/api/categories/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: tooLong }),
      }),
      { "*": created.id }
    );

    const row = await getDb(getIntegrationEnv().DB).query.financialCategories.findFirst({
      where: eq(financialCategories.id, created.id),
    });
    expect(row?.description).toBe("ok");
  });

  it("does not update another household's category description", async () => {
    const suffix = crypto.randomUUID();
    const otherHouseholdId = `hh-categories-other-${suffix}`;
    const otherOwnerId = `user-categories-other-${suffix}`;
    await seedHouseholdWithOwner(getDb(getIntegrationEnv().DB), {
      householdId: otherHouseholdId,
      ownerId: otherOwnerId,
      ownerAuthId: `clerk_categories_other_${suffix}`,
    });

    const createdResponse = await callCategories("POST", {
      householdId: otherHouseholdId,
      userId: otherOwnerId,
      body: { name: "Rent", type: "expense", description: "rent and utilities" },
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as { id: string };

    await expect(
      callCategories("PATCH", {
        id: created.id,
        body: { description: "taken" },
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Category not found",
    });

    const row = await getDb(getIntegrationEnv().DB).query.financialCategories.findFirst({
      where: and(
        eq(financialCategories.id, created.id),
        eq(financialCategories.householdId, otherHouseholdId),
        isNull(financialCategories.deletedAt)
      ),
    });
    expect(row?.description).toBe("rent and utilities");
  });
});
