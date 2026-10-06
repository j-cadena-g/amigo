import { beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, pushSubscriptions, transactions, users } from "@amigo/db";
import { createTestDb, seedExpenseTransaction, seedHouseholdWithOwner, testSession } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import { cleanupStalePushSubscriptions, handlePushRequest } from "./push";

describe("push notifications", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-push-${suffix}`;
    ownerId = `user-push-owner-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_push_owner_${suffix}`,
    });
  });

  function requestPreferences(
    method = "GET",
    body?: unknown,
    session = testSession({ userId: ownerId, householdId })
  ) {
    return handlePushRequest({
      env: getIntegrationEnv(),
      params: { "*": "preferences" },
      request: new Request("http://localhost/api/push/preferences", {
        method,
        ...(body !== undefined && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      }),
      sessionStatus: "authenticated",
      session,
      loadContext: {} as never,
    });
  }

  it("keeps grocery updates enabled and recurring reminders opt-in by default", async () => {
    const response = await requestPreferences();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groceryNotifications: true,
      recurringNotifications: false,
      transactionNotifications: true,
    });
  });

  it("updates each notification category independently without deleting device subscriptions", async () => {
    const db = createTestDb(getIntegrationEnv().DB);
    const subscriptionId = crypto.randomUUID();
    await db.insert(pushSubscriptions).values({
      id: subscriptionId,
      userId: ownerId,
      endpoint: `https://updates.push.services.mozilla.com/wpush/v2/${subscriptionId}`,
      keys: { p256dh: "test-p256dh", auth: "test-auth" },
    });

    const recurringResponse = await requestPreferences("PATCH", {
      recurringNotifications: true,
    });
    expect(await recurringResponse.json()).toEqual({
      groceryNotifications: true,
      recurringNotifications: true,
      transactionNotifications: true,
    });

    const groceryResponse = await requestPreferences("PATCH", {
      groceryNotifications: false,
    });
    expect(await groceryResponse.json()).toEqual({
      groceryNotifications: false,
      recurringNotifications: true,
      transactionNotifications: true,
    });
    expect(await (await requestPreferences()).json()).toEqual({
      groceryNotifications: false,
      recurringNotifications: true,
      transactionNotifications: true,
    });
    const transactionResponse = await requestPreferences("PATCH", {
      transactionNotifications: false,
    });
    expect(await transactionResponse.json()).toEqual({
      groceryNotifications: false,
      recurringNotifications: true,
      transactionNotifications: false,
    });
    expect(
      await db.query.pushSubscriptions.findFirst({
        where: eq(pushSubscriptions.id, subscriptionId),
      })
    ).toBeDefined();
  });

  it("updates only the authenticated member's preferences", async () => {
    const db = createTestDb(getIntegrationEnv().DB);
    const memberId = crypto.randomUUID();
    await db.insert(users).values({
      id: memberId,
      authId: `clerk_push_member_${memberId}`,
      email: "member@example.com",
      householdId,
    });
    const response = await requestPreferences(
      "PATCH",
      { groceryNotifications: false, recurringNotifications: true },
      testSession({ userId: memberId, householdId, role: "member" })
    );
    expect(response.status).toBe(200);
    expect(await (await requestPreferences()).json()).toEqual({
      groceryNotifications: true,
      recurringNotifications: false,
      transactionNotifications: true,
    });
  });

  it.each(["GET", "PATCH"])("rejects %s when the session household does not match the user's household", async (method) => {
    const response = await requestPreferences(
      method,
      method === "PATCH" ? { recurringNotifications: true } : undefined,
      testSession({ userId: ownerId, householdId: "other-household" })
    );
    expect(response.status).toBe(403);
    expect(await (await requestPreferences()).json()).toEqual({
      groceryNotifications: true,
      recurringNotifications: false,
      transactionNotifications: true,
    });
  });

  it.each(["GET", "PATCH"])("rejects %s for a soft-deleted user", async (method) => {
    const db = createTestDb(getIntegrationEnv().DB);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, ownerId));
    const response = await requestPreferences(
      method,
      method === "PATCH" ? { recurringNotifications: true } : undefined
    );
    expect(response.status).toBe(403);
    const user = await db.query.users.findFirst({ where: eq(users.id, ownerId) });
    expect(user?.recurringNotifications).toBe(false);
  });

  it.each([
    {},
    { groceryNotifications: "false" },
    { recurringNotifications: 1 },
    { recurringNotifications: null },
    { transactionNotifications: "false" },
    { transactionNotifications: null },
    { recurringNotifications: true, userId: "other-user" },
    { recurringNotifications: true, householdId: "other-household" },
  ])("rejects invalid notification preferences %j", async (body) => {
    await expect(requestPreferences("PATCH", body)).rejects.toMatchObject({
      name: "ZodError",
    });
    expect(await (await requestPreferences()).json()).toEqual({
      groceryNotifications: true,
      recurringNotifications: false,
      transactionNotifications: true,
    });
  });

  it("advertises only supported preference methods", async () => {
    const response = await requestPreferences("POST", { recurringNotifications: true });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, PATCH");
  });

  it("retains dormant recurring devices while removing other stale subscriptions", async () => {
    const db = createTestDb(getIntegrationEnv().DB);
    const recurringUserId = crypto.randomUUID();
    const deletedUserId = crypto.randomUUID();
    await db.insert(users).values([
      {
        id: recurringUserId,
        authId: `clerk_recurring_${recurringUserId}`,
        email: "recurring@example.com",
        householdId,
        recurringNotifications: true,
      },
      {
        id: deletedUserId,
        authId: `clerk_deleted_${deletedUserId}`,
        email: "deleted@example.com",
        householdId,
        recurringNotifications: true,
        deletedAt: new Date(),
      },
    ]);
    const old = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    const recurringId = crypto.randomUUID();
    const groceryId = crypto.randomUUID();
    const deletedId = crypto.randomUUID();
    const freshId = crypto.randomUUID();
    for (const [id, userId, updatedAt] of [
      [recurringId, recurringUserId, old],
      [groceryId, ownerId, old],
      [deletedId, deletedUserId, old],
      [freshId, ownerId, new Date()],
    ] as const) {
      await db.insert(pushSubscriptions).values({
        id,
        userId,
        endpoint: `https://updates.push.services.mozilla.com/wpush/v2/${id}`,
        keys: { p256dh: "test-p256dh", auth: "test-auth" },
        updatedAt,
      });
    }

    const result = await cleanupStalePushSubscriptions(getIntegrationEnv());
    expect(result.deletedCount).toBe(2);
    const remaining = await db.query.pushSubscriptions.findMany({
      columns: { id: true },
      where: inArray(pushSubscriptions.id, [recurringId, groceryId, deletedId, freshId]),
    });
    expect(remaining.map((subscription) => subscription.id).sort()).toEqual(
      [recurringId, freshId].sort()
    );
  });

  it.each([
    { kind: "future reminder", retain: true, hours: 24 },
    { kind: "due reminder within catch-up window", retain: true, hours: -1 },
    { kind: "past reminder beyond catch-up window", retain: false, hours: -24 },
    { kind: "disabled transaction preference", retain: false, hours: 24 },
    { kind: "deleted transaction", retain: false, hours: 24 },
    { kind: "deleted user", retain: false, hours: 24 },
    { kind: "different recipient", retain: false, hours: 24 },
  ])("$kind determines retention of a dormant transaction reminder device", async ({ kind, retain, hours }) => {
    const db = createTestDb(getIntegrationEnv().DB);
    const transactionId = crypto.randomUUID();
    const subscriptionId = crypto.randomUUID();
    await seedExpenseTransaction(db, {
      id: transactionId,
      householdId,
      userId: ownerId,
      amount: 4000,
      category: "Dining",
    });
    await db.update(transactions).set({
      reminderTimes: [new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()],
      reminderUserId: kind === "different recipient" ? null : ownerId,
      deletedAt: kind === "deleted transaction" ? new Date() : null,
    }).where(eq(transactions.id, transactionId));
    if (kind === "disabled transaction preference") {
      await db.update(users).set({ transactionNotifications: false }).where(eq(users.id, ownerId));
    }
    if (kind === "deleted user") {
      await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, ownerId));
    }
    await db.insert(pushSubscriptions).values({
      id: subscriptionId,
      userId: ownerId,
      endpoint: `https://updates.push.services.mozilla.com/wpush/v2/${subscriptionId}`,
      keys: { p256dh: "test-p256dh", auth: "test-auth" },
      updatedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
    });

    await cleanupStalePushSubscriptions(getIntegrationEnv());
    const subscription = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.id, subscriptionId),
    });
    expect(Boolean(subscription)).toBe(retain);
  });

  it.each(["POST", "DELETE"])("does not allow %s to take over another user's endpoint", async (method) => {
    const db = createTestDb(getIntegrationEnv().DB);
    const otherId = crypto.randomUUID();
    await seedHouseholdWithOwner(db, {
      householdId: `hh-other-${otherId}`,
      ownerId: otherId,
      ownerAuthId: `clerk_other_${otherId}`,
    });
    const endpoint = `https://updates.push.services.mozilla.com/wpush/v2/${otherId}`;
    await db.insert(pushSubscriptions).values({
      userId: otherId,
      endpoint,
      keys: { p256dh: "original-key", auth: "original-auth" },
    });
    const response = await handlePushRequest({
      env: getIntegrationEnv(),
      params: {},
      request: new Request("http://localhost/api/push", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, keys: { p256dh: "new-key", auth: "new-auth" } }),
      }),
      sessionStatus: "authenticated",
      session: testSession({ userId: ownerId, householdId }),
      loadContext: {} as never,
    });
    expect(response.status).toBe(403);
    const subscription = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.endpoint, endpoint),
    });
    expect(subscription?.userId).toBe(otherId);
    expect(subscription?.keys).toEqual({ p256dh: "original-key", auth: "original-auth" });
  });

  it.each([
    "http://updates.push.services.mozilla.com/wpush/v2/test",
    "https://127.0.0.1:8787/push",
    "https://[::1]/push",
    "https://[fec0::1]/push",
    "https://localhost/push",
    "https://user:pass@updates.push.services.mozilla.com/wpush/v2/test",
  ])("rejects unsafe push endpoint %s", async (endpoint) => {
    await expect(
      handlePushRequest({
        env: getIntegrationEnv(),
        params: {},
        request: new Request("http://localhost/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint,
            keys: {
              p256dh: "test-p256dh",
              auth: "test-auth",
            },
          }),
        }),
        sessionStatus: "authenticated",
        session: testSession({ userId: ownerId, householdId }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Unsafe push subscription endpoint",
    });
  });
});
