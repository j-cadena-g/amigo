import {
  budgets,
  eq,
  getDb,
  households,
  pushSubscriptions,
  transactionReminderDeliveries,
  transactions,
  users,
  type NewTransaction,
} from "@amigo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { seedHouseholdWithOwner, seedMonthlyBudget } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import {
  claimTransactionReminderDelivery,
  processTransactionReminders,
  pruneTransactionReminderDeliveries,
} from "./transaction-reminders";

const now = new Date("2026-10-03T09:00:00.000Z");
const at = now.toISOString();
const send = vi.fn<typeof webpush.sendNotification>();

describe("explicit transaction reminder delivery", () => {
  let householdId: string;
  let ownerId: string;
  let subscriptionId: string;
  const db = () => getDb(getIntegrationEnv().DB);
  const env = () => ({
    ...getIntegrationEnv(),
    VAPID_SUBJECT: "mailto:test@example.com",
    VAPID_PUBLIC_KEY: "test-public",
    VAPID_PRIVATE_KEY: "test-private",
  });

  async function addSubscription(userId: string) {
    const id = crypto.randomUUID();
    await db()
      .insert(pushSubscriptions)
      .values({
        id,
        userId,
        endpoint: `https://updates.push.services.mozilla.com/wpush/v2/${id}`,
        keys: { p256dh: "test", auth: "test" },
      });
    return id;
  }

  async function addTransaction(overrides: Partial<NewTransaction> = {}) {
    const id = crypto.randomUUID();
    await db()
      .insert(transactions)
      .values({
        id,
        householdId,
        userId: ownerId,
        amount: 10000,
        category: "Utilities",
        description: "Phone bill",
        currency: "CAD",
        type: "expense",
        date: "2026-10-04",
        reminderTimes: [at],
        reminderUserId: ownerId,
        ...overrides,
      });
    return id;
  }

  beforeEach(async () => {
    vi.spyOn(webpush, "sendNotification").mockImplementation(send);
    vi.spyOn(webpush, "setVapidDetails").mockImplementation(() => {});
    send.mockReset().mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    householdId = `hh-transaction-reminder-${crypto.randomUUID()}`;
    ownerId = `user-transaction-reminder-${crypto.randomUUID()}`;
    await seedHouseholdWithOwner(db(), { householdId, ownerId, ownerAuthId: crypto.randomUUID() });
    subscriptionId = await addSubscription(ownerId);
  });

  afterEach(async () => {
    await db().delete(households).where(eq(households.id, householdId));
    vi.restoreAllMocks();
  });

  it("delivers independent selected times to each device only once during overlapping runs", async () => {
    await addSubscription(ownerId);
    await addTransaction({ reminderTimes: ["2026-10-03T08:00:00.000Z", at] });
    await Promise.all([
      processTransactionReminders(env(), () => now),
      processTransactionReminders(env(), () => now),
    ]);
    await processTransactionReminders(env(), () => new Date("2026-10-03T09:01:00.000Z"));
    expect(send).toHaveBeenCalledTimes(4);
    expect(new Set(send.mock.calls.map((call) => JSON.parse(call[1] as string).tag)).size).toBe(2);
    const rows = await db().select().from(transactionReminderDeliveries);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.deliveredAt?.getTime() === now.getTime())).toBe(true);
  });

  it("claims atomically, recovers an expired lease and never reclaims a delivered reminder", async () => {
    const transactionId = await addTransaction();
    const claims = await Promise.all([
      claimTransactionReminderDelivery(db(), transactionId, subscriptionId, at, now),
      claimTransactionReminderDelivery(db(), transactionId, subscriptionId, at, now),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(
      await claimTransactionReminderDelivery(
        db(),
        transactionId,
        subscriptionId,
        at,
        new Date("2026-10-03T09:04:59.000Z")
      )
    ).toBeNull();
    const recovered = await claimTransactionReminderDelivery(
      db(),
      transactionId,
      subscriptionId,
      at,
      new Date("2026-10-03T09:05:00.000Z")
    );
    expect(recovered).not.toBeNull();
    await db()
      .update(transactionReminderDeliveries)
      .set({ deliveredAt: now })
      .where(eq(transactionReminderDeliveries.id, recovered!.id));
    expect(
      await claimTransactionReminderDelivery(
        db(),
        transactionId,
        subscriptionId,
        at,
        new Date("2026-10-03T10:00:00.000Z")
      )
    ).toBeNull();
  });

  it("retries failed delivery with a stable tag and remaining three-hour TTL", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await addTransaction();
    send.mockRejectedValueOnce({ statusCode: 503 });
    expect(await processTransactionReminders(env(), () => now)).toEqual({ sent: 0, failed: 1 });
    expect(
      await processTransactionReminders(env(), () => new Date("2026-10-03T10:00:00.000Z"))
    ).toEqual({ sent: 1, failed: 0 });
    expect(send.mock.calls[0]?.[2]).toMatchObject({ TTL: 10800 });
    expect(send.mock.calls[1]?.[2]).toMatchObject({ TTL: 7200 });
    expect(JSON.parse(send.mock.calls[0]![1] as string).tag).toBe(
      JSON.parse(send.mock.calls[1]![1] as string).tag
    );
  });

  it("skips future and expired times but delivers due times without household timezone changes", async () => {
    await db()
      .update(households)
      .set({ timezone: "Pacific/Kiritimati" })
      .where(eq(households.id, householdId));
    await addTransaction({
      reminderTimes: [
        "2026-10-03T06:00:00.000Z",
        "2026-10-03T06:01:00.000Z",
        at,
        "2026-10-03T09:01:00.000Z",
      ],
    });
    await processTransactionReminders(env(), () => now);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map((call) => call[2]?.TTL).sort((a, b) => a! - b!)).toEqual([
      60, 10800,
    ]);
  });

  it.each(["canceled", "edited", "deleted"])("does not retry a %s schedule", async (change) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const transactionId = await addTransaction();
    send.mockRejectedValueOnce({ statusCode: 503 });
    await processTransactionReminders(env(), () => now);
    await db()
      .update(transactions)
      .set(
        change === "deleted"
          ? { deletedAt: now }
          : { reminderTimes: change === "canceled" ? [] : ["2026-10-04T09:00:00.000Z"] }
      )
      .where(eq(transactions.id, transactionId));
    await processTransactionReminders(env(), () => new Date("2026-10-03T09:01:00.000Z"));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("revalidates cancellation and deletion between deliveries in the same batch", async () => {
    const transactionId = await addTransaction({ reminderTimes: ["2026-10-03T08:00:00.000Z", at] });
    send.mockImplementationOnce(async () => {
      await db()
        .update(transactions)
        .set({ reminderTimes: [] })
        .where(eq(transactions.id, transactionId));
      return { statusCode: 201, body: "", headers: {} };
    });
    await processTransactionReminders(env(), () => now);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("honors the reminder recipient for a shared-budget transaction and does not notify its owner", async () => {
    const memberId = crypto.randomUUID();
    await db()
      .insert(users)
      .values({
        id: memberId,
        authId: crypto.randomUUID(),
        email: "member@example.com",
        householdId,
        language: "es",
      });
    const memberSubscription = await addSubscription(memberId);
    const budgetId = crypto.randomUUID();
    await seedMonthlyBudget(db(), {
      id: budgetId,
      householdId,
      userId: null,
      name: "Shared",
      category: "Utilities",
      limitAmount: 10000,
    });
    await addTransaction({ budgetId, reminderUserId: memberId });
    await processTransactionReminders(env(), () => now);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].endpoint).toContain(memberSubscription);
    expect(JSON.parse(send.mock.calls[0]![1] as string).body).toBe("Recordatorio: Phone bill");
  });

  it("skips revoked shared-budget visibility and private rules assigned to another recipient", async () => {
    const memberId = crypto.randomUUID();
    await db()
      .insert(users)
      .values({
        id: memberId,
        authId: crypto.randomUUID(),
        email: "member@example.com",
        householdId,
      });
    await addSubscription(memberId);
    const budgetId = crypto.randomUUID();
    await seedMonthlyBudget(db(), {
      id: budgetId,
      householdId,
      userId: null,
      name: "Shared",
      category: "Utilities",
      limitAmount: 10000,
    });
    await addTransaction({ reminderUserId: memberId });
    await addTransaction({ reminderUserId: memberId, budgetId });
    await db().update(budgets).set({ deletedAt: now }).where(eq(budgets.id, budgetId));
    await processTransactionReminders(env(), () => now);
    expect(send).not.toHaveBeenCalled();
  });

  it("honors a changed recipient after an unsuccessful delivery", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const memberId = crypto.randomUUID();
    await db()
      .insert(users)
      .values({
        id: memberId,
        authId: crypto.randomUUID(),
        email: "member@example.com",
        householdId,
      });
    const memberSubscription = await addSubscription(memberId);
    const budgetId = crypto.randomUUID();
    await seedMonthlyBudget(db(), {
      id: budgetId,
      householdId,
      userId: null,
      name: "Shared",
      category: "Utilities",
      limitAmount: 10000,
    });
    const transactionId = await addTransaction({ budgetId });
    send.mockRejectedValueOnce({ statusCode: 503 });
    await processTransactionReminders(env(), () => now);
    await db()
      .update(transactions)
      .set({ reminderUserId: memberId })
      .where(eq(transactions.id, transactionId));
    await processTransactionReminders(env(), () => new Date("2026-10-03T09:01:00.000Z"));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0].endpoint).toContain(subscriptionId);
    expect(send.mock.calls[1]?.[0].endpoint).toContain(memberSubscription);
  });

  it("does not notify a recipient whose household no longer matches the transaction", async () => {
    const otherHousehold = crypto.randomUUID();
    await db().insert(households).values({ id: otherHousehold, name: "Other" });
    try {
      await addTransaction();
      await db().update(users).set({ householdId: otherHousehold }).where(eq(users.id, ownerId));
      await processTransactionReminders(env(), () => now);
      expect(send).not.toHaveBeenCalled();
    } finally {
      await db().delete(households).where(eq(households.id, otherHousehold));
    }
  });

  it("skips disabled or deleted recipients, missing subscriptions and absent VAPID", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await addTransaction();
    await processTransactionReminders({ ...env(), VAPID_PRIVATE_KEY: undefined }, () => now);
    await db().update(users).set({ transactionNotifications: false }).where(eq(users.id, ownerId));
    await processTransactionReminders(env(), () => now);
    await db()
      .update(users)
      .set({ transactionNotifications: true, deletedAt: now })
      .where(eq(users.id, ownerId));
    await processTransactionReminders(env(), () => now);
    await db().update(users).set({ deletedAt: null }).where(eq(users.id, ownerId));
    await db().delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptionId));
    await processTransactionReminders(env(), () => now);
    expect(send).not.toHaveBeenCalled();
  });

  it("uses fresh clocks so later devices never receive an expired reminder", async () => {
    await addTransaction();
    await addSubscription(ownerId);
    let current = now;
    send.mockImplementationOnce(async () => {
      current = new Date("2026-10-03T12:00:00.000Z");
      return { statusCode: 201, body: "", headers: {} };
    });
    await processTransactionReminders(env(), () => current);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("removes expired devices, cascades hard-deleted transactions and prunes old ledgers", async () => {
    const transactionId = await addTransaction();
    await claimTransactionReminderDelivery(
      db(),
      transactionId,
      subscriptionId,
      "2026-01-01T09:00:00.000Z",
      new Date("2026-01-01T09:00:00.000Z")
    );
    await pruneTransactionReminderDeliveries(db(), new Date("2026-07-01T00:00:00.000Z"));
    expect(await db().query.transactionReminderDeliveries.findFirst()).toBeUndefined();
    send.mockRejectedValueOnce({ statusCode: 410 });
    await processTransactionReminders(env(), () => now);
    expect(
      await db().query.pushSubscriptions.findFirst({
        where: eq(pushSubscriptions.id, subscriptionId),
      })
    ).toBeUndefined();
    expect(await db().query.transactionReminderDeliveries.findFirst()).toBeUndefined();
    const freshSub = await addSubscription(ownerId);
    await claimTransactionReminderDelivery(db(), transactionId, freshSub, at, now);
    await db().delete(transactions).where(eq(transactions.id, transactionId));
    expect(await db().query.transactionReminderDeliveries.findFirst()).toBeUndefined();
  });
});
