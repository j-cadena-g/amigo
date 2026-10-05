import {
  and,
  auditLogs,
  eq,
  financialAccounts,
  isNull,
  pushSubscriptions,
  scopeToHousehold,
  transactionReminderDeliveries,
  transactions,
  users,
  type Transaction,
} from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  seedFinancialCategory,
  seedHouseholdWithOwner,
  seedMonthlyBudget,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import { handleTransactionsRequest } from "./transactions";

const FIRST = "2100-01-01T09:00:00.000Z";
const SECOND = "2100-01-02T09:00:00.000Z";
const PAST = "2000-01-01T09:00:00.000Z";

describe("explicit transaction reminders", () => {
  let householdId: string;
  let ownerId: string;
  let categoryId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-txn-reminders-${suffix}`;
    ownerId = `user-txn-reminders-${suffix}`;
    categoryId = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_txn_reminders_${suffix}`,
    });
    await seedFinancialCategory(db, { id: categoryId, householdId, name: "Dining" });
  });

  function call(
    method: "GET" | "POST" | "PATCH",
    body?: unknown,
    id?: string,
    session = testSession({ userId: ownerId, householdId })
  ) {
    return handleTransactionsRequest({
      env: getIntegrationEnv(),
      params: { "*": id ?? "" },
      request: new Request(`http://localhost/api/transactions${id ? `/${id}` : ""}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
  }

  async function create(extra: Record<string, unknown> = {}): Promise<Transaction> {
    const response = await call("POST", {
      amount: 40,
      categoryId,
      type: "expense",
      date: "2100-01-03",
      ...extra,
    });
    expect(response.status).toBe(201);
    return await response.json() as Transaction;
  }

  async function stored(id: string) {
    return createTestDb(getIntegrationEnv().DB).query.transactions.findFirst({
      where: and(
        eq(transactions.id, id),
        scopeToHousehold(transactions.householdId, householdId),
        isNull(transactions.deletedAt)
      ),
    });
  }

  it("defaults to no reminders and no recipient", async () => {
    const transaction = await create();
    expect(transaction.reminderTimes).toEqual([]);
    expect(transaction.reminderUserId).toBeNull();
  });

  it("normalizes, sorts and persists reminder times for the authenticated user", async () => {
    const transaction = await create({ reminderTimes: [SECOND, "2100-01-01T09:00Z"] });
    expect(transaction.reminderTimes).toEqual([FIRST, SECOND]);
    expect(transaction.reminderUserId).toBe(ownerId);
    const list = await (await call("GET")).json() as { data: Transaction[] };
    expect(list.data.find((row) => row.id === transaction.id)?.reminderTimes).toEqual([FIRST, SECOND]);
    const db = createTestDb(getIntegrationEnv().DB);
    const audit = await db.query.auditLogs.findFirst({
      where: and(
        scopeToHousehold(auditLogs.householdId, householdId),
        eq(auditLogs.recordId, transaction.id),
        eq(auditLogs.operation, "INSERT")
      ),
    });
    expect(audit?.newValues).toMatchObject({ reminderTimes: [FIRST, SECOND], reminderUserId: ownerId });
  });

  it("adds, changes and clears reminders through the existing transaction update", async () => {
    const transaction = await create();
    const added = await (await call("PATCH", { reminderTimes: [FIRST] }, transaction.id)).json() as Transaction;
    expect(added.reminderTimes).toEqual([FIRST]);
    expect(added.reminderUserId).toBe(ownerId);
    const unchanged = await (await call("PATCH", { reminderTimes: [FIRST] }, transaction.id)).json() as Transaction;
    expect(unchanged.reminderTimes).toEqual([FIRST]);
    expect(unchanged.reminderUserId).toBe(ownerId);
    const changed = await (await call("PATCH", { reminderTimes: [SECOND, FIRST] }, transaction.id)).json() as Transaction;
    expect(changed.reminderTimes).toEqual([FIRST, SECOND]);
    expect(changed.reminderUserId).toBe(ownerId);
    const cleared = await (await call("PATCH", { reminderTimes: [] }, transaction.id)).json() as Transaction;
    expect(cleared.reminderTimes).toEqual([]);
    expect(cleared.reminderUserId).toBeNull();
    expect((await stored(transaction.id))?.amount).toBe(4000);
  });

  it.each([
    [FIRST, SECOND, "2100-01-03T09:00:00Z", "2100-01-04T09:00:00Z", "2100-01-05T09:00:00Z"],
    [FIRST, FIRST],
    [FIRST, "2100-01-01T09:00Z"],
    ["2100-02-30T09:00:00.000Z"],
    ["2100-01-01T24:00:00.000Z"],
    ["2100-01-01T09:00:01.000Z"],
    ["2100-01-01T09:00:00.001Z"],
    ["2100-01-01T09:00:00-05:00"],
    ["2100-01-01T09:00"],
    ["not-a-date"],
  ])("rejects invalid or duplicate reminders %j on create and update", async (...reminderTimes) => {
    await expect(create({ reminderTimes })).rejects.toMatchObject({ name: "ZodError" });
    const transaction = await create();
    await expect(call("PATCH", { reminderTimes }, transaction.id)).rejects.toMatchObject({ name: "ZodError" });
    expect((await stored(transaction.id))?.reminderTimes).toEqual([]);
  });

  it("accepts exactly four reminders", async () => {
    const reminderTimes = [FIRST, SECOND, "2100-01-03T09:00:00.000Z", "2100-01-04T09:00:00.000Z"];
    const transaction = await create({ reminderTimes });
    expect(transaction.reminderTimes).toEqual(reminderTimes);
  });

  it("rejects newly introduced past reminders on create and update", async () => {
    await expect(create({ reminderTimes: [PAST] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const transaction = await create();
    await expect(call("PATCH", { reminderTimes: [PAST] }, transaction.id)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await stored(transaction.id))?.reminderUserId).toBeNull();
  });

  it("preserves elapsed reminders and their original recipient while editing unrelated fields", async () => {
    const transaction = await create();
    const db = createTestDb(getIntegrationEnv().DB);
    const originalRecipient = crypto.randomUUID();
    await db.insert(users).values({
      id: originalRecipient,
      authId: `clerk_original_${originalRecipient}`,
      email: "original@example.com",
      householdId,
    });
    await db.update(transactions).set({
      reminderTimes: [PAST],
      reminderUserId: originalRecipient,
    }).where(eq(transactions.id, transaction.id));
    const edited = await (await call("PATCH", { amount: 50, reminderTimes: [PAST] }, transaction.id)).json() as Transaction;
    expect(edited.amount).toBe(5000);
    expect(edited.reminderTimes).toEqual([PAST]);
    expect(edited.reminderUserId).toBe(originalRecipient);
    const omitted = await (await call("PATCH", { amount: 60 }, transaction.id)).json() as Transaction;
    expect(omitted.reminderUserId).toBe(originalRecipient);
    const changed = await (await call("PATCH", { reminderTimes: [FIRST, PAST] }, transaction.id)).json() as Transaction;
    expect(changed.reminderTimes).toEqual([PAST, FIRST]);
    expect(changed.reminderUserId).toBe(ownerId);
  });

  it("rejects client-selected reminder recipients", async () => {
    await expect(create({ reminderTimes: [FIRST], reminderUserId: ownerId })).rejects.toMatchObject({ name: "ZodError" });
    const transaction = await create();
    await expect(call("PATCH", { reminderTimes: [FIRST], reminderUserId: ownerId }, transaction.id)).rejects.toMatchObject({ name: "ZodError" });
    expect((await stored(transaction.id))?.reminderTimes).toEqual([]);
  });

  it("rejects edits from another household or another user, including shared budget rows", async () => {
    const db = createTestDb(getIntegrationEnv().DB);
    const budgetId = crypto.randomUUID();
    await seedMonthlyBudget(db, { id: budgetId, householdId, name: "Shared", category: "Dining", limitAmount: 20000 });
    const transaction = await create({ budgetId });
    const otherHouseholdId = crypto.randomUUID();
    const otherOwnerId = crypto.randomUUID();
    await seedHouseholdWithOwner(db, {
      householdId: otherHouseholdId,
      ownerId: otherOwnerId,
      ownerAuthId: `clerk_other_${otherOwnerId}`,
    });
    await expect(call("PATCH", { reminderTimes: [FIRST] }, transaction.id, testSession({ userId: otherOwnerId, householdId: otherHouseholdId }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    const memberId = crypto.randomUUID();
    await db.insert(users).values({ id: memberId, authId: `clerk_member_${memberId}`, email: "member@example.com", householdId });
    await expect(call("PATCH", { reminderTimes: [FIRST] }, transaction.id, testSession({ userId: memberId, householdId, role: "member" }))).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect((await stored(transaction.id))?.reminderTimes).toEqual([]);
    expect((await stored(transaction.id))?.reminderUserId).toBeNull();
  });

  it("rejects reminders on a soft-deleted transaction", async () => {
    const transaction = await create();
    await createTestDb(getIntegrationEnv().DB).update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, transaction.id));
    await expect(call("PATCH", { reminderTimes: [FIRST] }, transaction.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("never changes account balances when scheduling reminders or assigning an account", async () => {
    const db = createTestDb(getIntegrationEnv().DB);
    const accountId = crypto.randomUUID();
    await db.insert(financialAccounts).values({ id: accountId, householdId, userId: ownerId, name: "Visa", type: "CREDIT", balance: -25000 });
    const transaction = await create({ accountId, reminderTimes: [FIRST] });
    await call("PATCH", { reminderTimes: [SECOND] }, transaction.id);
    await call("PATCH", { reminderTimes: [], accountId: null }, transaction.id);
    const account = await db.query.financialAccounts.findFirst({ where: and(eq(financialAccounts.id, accountId), scopeToHousehold(financialAccounts.householdId, householdId), isNull(financialAccounts.deletedAt)) });
    expect(account?.balance).toBe(-25000);
    expect((await stored(transaction.id))?.amount).toBe(4000);
  });

  it("clears a deleted reminder recipient and cascades device delivery history", async () => {
    const db = createTestDb(getIntegrationEnv().DB);
    const transaction = await create({ reminderTimes: [FIRST] });
    const recipientId = crypto.randomUUID();
    await db.insert(users).values({ id: recipientId, authId: `clerk_recipient_${recipientId}`, email: "recipient@example.com", householdId });
    await db.update(transactions).set({ reminderUserId: recipientId }).where(eq(transactions.id, transaction.id));
    await db.delete(users).where(eq(users.id, recipientId));
    expect((await stored(transaction.id))?.reminderUserId).toBeNull();

    const subscriptionId = crypto.randomUUID();
    await db.insert(pushSubscriptions).values({ id: subscriptionId, userId: ownerId, endpoint: `https://updates.push.services.mozilla.com/wpush/v2/${subscriptionId}`, keys: { p256dh: "key", auth: "auth" } });
    const deliveryId = `transaction-reminder:${JSON.stringify([transaction.id, FIRST, subscriptionId])}`;
    await db.insert(transactionReminderDeliveries).values({ id: deliveryId, transactionId: transaction.id, subscriptionId, reminderAt: new Date(FIRST), leaseUntil: new Date(FIRST) });
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptionId));
    expect(await db.query.transactionReminderDeliveries.findFirst({ where: eq(transactionReminderDeliveries.id, deliveryId) })).toBeUndefined();

    await db.insert(pushSubscriptions).values({ id: subscriptionId, userId: ownerId, endpoint: `https://updates.push.services.mozilla.com/wpush/v2/${subscriptionId}`, keys: { p256dh: "key", auth: "auth" } });
    await db.insert(transactionReminderDeliveries).values({ id: deliveryId, transactionId: transaction.id, subscriptionId, reminderAt: new Date(FIRST), leaseUntil: new Date(FIRST) });
    await db.delete(transactions).where(eq(transactions.id, transaction.id));
    expect(await db.query.transactionReminderDeliveries.findFirst({ where: eq(transactionReminderDeliveries.id, deliveryId) })).toBeUndefined();
  });
});
