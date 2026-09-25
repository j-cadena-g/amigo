import { eq, groceryItems, type DrizzleD1 } from "@amigo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRouterLoadContext } from "../../router-context";
import type { AppSession, Env } from "../env";
import { createTestDb, seedHouseholdWithOwner } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import { handleGroceriesRequest } from "./groceries";
import { handleSyncRequest } from "./sync";

// What the Workers AI binding returns for typesafe/jev.
function jevResponse(choice: string, confidence = 0.97) {
  return {
    state: "Completed",
    result: {
      model: "jev-1.13.0",
      answers: { aisle: { type: "choice", choice, confidence } },
      usage: { input_tokens: 639, output_tokens: 107 },
    },
    gatewayMetadata: { keySource: "Unified" },
  };
}

function envWithAi(run: (...args: unknown[]) => unknown): Env {
  return { ...getIntegrationEnv(), AI: { run } as unknown as Ai };
}

describe("grocery categorization integration", () => {
  let householdId: string;
  let ownerId: string;
  let db: DrizzleD1;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-groceries-${suffix}`;
    ownerId = `user-groceries-owner-${suffix}`;

    db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_groceries_owner_${suffix}`,
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function session(): AppSession {
    return {
      userId: ownerId,
      householdId,
      role: "owner",
      email: "owner@example.com",
      name: "Owner",
    };
  }

  async function callGroceries(
    env: Env,
    method: string,
    path: string,
    body: unknown
  ) {
    const deferred: Promise<unknown>[] = [];
    const response = await handleGroceriesRequest({
      env,
      params: { "*": path },
      request: new Request(
        `http://localhost/api/groceries${path ? `/${path}` : ""}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      ),
      sessionStatus: "authenticated",
      session: session(),
      loadContext: createRouterLoadContext({
        cloudflare: {
          env,
          ctx: {
            waitUntil: (task: Promise<unknown>) => deferred.push(task),
          } as unknown as ExecutionContext,
          caches: {} as CacheStorage,
        },
        app: {
          cspNonce: "test-nonce",
          sessionStatus: "authenticated",
          session: session(),
        },
      }),
    });
    // Let the broadcast and push tasks finish inside the test.
    await Promise.all(deferred);
    return response;
  }

  async function seedItem(itemName: string, category: string) {
    const id = crypto.randomUUID();
    await db.insert(groceryItems).values({
      id,
      householdId,
      createdByUserId: ownerId,
      itemName,
      category,
    });
    return id;
  }

  it("stores Jev's aisle when an item is added", async () => {
    const run = vi.fn().mockResolvedValue(jevResponse("Dairy"));

    const response = await callGroceries(envWithAi(run), "POST", "", {
      name: "leche 2%",
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      itemName: "leche 2%",
      category: "Dairy",
    });
    expect(run).toHaveBeenCalledWith(
      "typesafe/jev",
      expect.objectContaining({ state: "leche 2%" }),
      expect.anything()
    );
  });

  it("moves a renamed item to Jev's new aisle", async () => {
    const id = await seedItem("pan", "Bakery");
    const run = vi.fn().mockResolvedValue(jevResponse("Frozen"));

    const response = await callGroceries(envWithAi(run), "PATCH", id, {
      name: "helado de fresa",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      itemName: "helado de fresa",
      category: "Frozen",
    });
  });

  it("keeps the current aisle when Jev fails on a rename", async () => {
    const id = await seedItem("leche", "Dairy");
    const run = vi
      .fn()
      .mockRejectedValue(new Error("2021: Insufficient AI Gateway credits"));

    const response = await callGroceries(envWithAi(run), "PATCH", id, {
      name: "leche 2%",
    });

    expect(response.status).toBe(200);
    const [row] = await db
      .select()
      .from(groceryItems)
      .where(eq(groceryItems.id, id));
    expect(row).toMatchObject({ itemName: "leche 2%", category: "Dairy" });
  });

  // A Jev call that stays pending until the test answers it, so another
  // rename can land on the row while this one waits.
  function pendingJev() {
    const jev = {} as {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    };
    const run = vi.fn(
      () =>
        new Promise((resolve, reject) => {
          jev.resolve = resolve;
          jev.reject = reject;
        })
    );
    return { run, jev };
  }

  async function landOverlappingRename(id: string) {
    await db
      .update(groceryItems)
      .set({ itemName: "helado", category: "Frozen" })
      .where(eq(groceryItems.id, id));
  }

  it("keeps an overlapping rename's aisle when Jev fails", async () => {
    const id = await seedItem("leche", "Dairy");
    const { run, jev } = pendingJev();

    const rename = callGroceries(envWithAi(run), "PATCH", id, {
      name: "leche 2%",
    });
    await vi.waitFor(() => expect(run).toHaveBeenCalled());
    await landOverlappingRename(id);
    jev.reject(new Error("upstream"));

    expect((await rename).status).toBe(200);
    const [row] = await db
      .select()
      .from(groceryItems)
      .where(eq(groceryItems.id, id));
    expect(row).toMatchObject({ itemName: "leche 2%", category: "Frozen" });
  });

  it("stores Jev's aisle even when it matches the one read before an overlapping rename", async () => {
    const id = await seedItem("leche", "Dairy");
    const { run, jev } = pendingJev();

    const rename = callGroceries(envWithAi(run), "PATCH", id, {
      name: "leche 2%",
    });
    await vi.waitFor(() => expect(run).toHaveBeenCalled());
    await landOverlappingRename(id);
    jev.resolve(jevResponse("Dairy"));

    expect((await rename).status).toBe(200);
    const [row] = await db
      .select()
      .from(groceryItems)
      .where(eq(groceryItems.id, id));
    expect(row).toMatchObject({ itemName: "leche 2%", category: "Dairy" });
  });

  it("stores Jev's aisle for an offline sync add", async () => {
    const run = vi.fn().mockResolvedValue(jevResponse("Produce"));

    const response = await handleSyncRequest({
      env: envWithAi(run),
      params: {},
      request: new Request("http://localhost/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mutations: [
            {
              id: `mutation-${crypto.randomUUID()}`,
              operation: "add",
              entityType: "groceryItem",
              entityId: `item-${crypto.randomUUID()}`,
              payload: { name: "aguacate avocado" },
            },
          ],
        }),
      }),
      sessionStatus: "authenticated",
      session: session(),
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      processed: 1,
      results: [
        {
          success: true,
          serverItem: { itemName: "aguacate avocado", category: "Produce" },
        },
      ],
    });
  });
});
