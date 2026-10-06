import {
  eq,
  getDb,
  households,
  pushSubscriptions,
  recurringReminderDeliveries,
  recurringTransactions,
  users,
  type NewRecurringTransaction,
  transactions,
} from "@amigo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { seedHouseholdWithOwner } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import {
  claimReminderDelivery,
  processRecurringReminders,
  pruneRecurringReminderDeliveries,
} from "./recurring-reminders";
import { processPushBatch } from "./push/sender";
import { processDueRecurringRules } from "./recurring-processor";

const now = new Date("2026-10-03T09:00:00.000Z");
const send = vi.fn<typeof webpush.sendNotification>();

describe("selected recurring reminder delivery", () => {
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
  async function addRule(overrides: Partial<NewRecurringTransaction> = {}) {
    const id = crypto.randomUUID();
    await db()
      .insert(recurringTransactions)
      .values({
        id,
        householdId,
        userId: ownerId,
        amount: 10000,
        category: "Utilities",
        description: "Phone bill",
        currency: "CAD",
        type: "expense",
        frequency: "DAILY",
        interval: 1,
        startDate: "2026-01-01",
        nextRunDate: "2026-10-04",
        reminderSchedules: [{ dayOffset: 0, time: "09:00" }],
        ...overrides,
      });
    return id;
  }
  beforeEach(async () => {
    vi.spyOn(webpush, "sendNotification").mockImplementation(send);
    vi.spyOn(webpush, "setVapidDetails").mockImplementation(() => {});
    send.mockReset().mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    householdId = `hh-reminder-${crypto.randomUUID()}`;
    ownerId = `user-reminder-${crypto.randomUUID()}`;
    await seedHouseholdWithOwner(db(), { householdId, ownerId, ownerAuthId: crypto.randomUUID() });
    await db().update(users).set({ recurringNotifications: true }).where(eq(users.id, ownerId));
    subscriptionId = await addSubscription(ownerId);
  });
  afterEach(async () => {
    await db().delete(households).where(eq(households.id, householdId));
    vi.restoreAllMocks();
  });

  it("delivers multiple rules and selected times independently to every owner device once", async () => {
    await addSubscription(ownerId);
    await addRule({
      reminderSchedules: [
        { dayOffset: 0, time: "08:00" },
        { dayOffset: 0, time: "09:00" },
      ],
    });
    await addRule({ type: "income" });
    await Promise.all([
      processRecurringReminders(env(), () => now),
      processRecurringReminders(env(), () => now),
    ]);
    await processRecurringReminders(env(), () => new Date("2026-10-03T09:01:00.000Z"));
    expect(send).toHaveBeenCalledTimes(6);
    expect(new Set(send.mock.calls.map((call) => JSON.parse(call[1] as string).tag)).size).toBe(3);
    const rows = await db().select().from(recurringReminderDeliveries);
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.deliveredAt?.getTime() === now.getTime())).toBe(true);
  });

  it("claims atomically and recovers expired leases without reclaiming completed reminders", async () => {
    const ruleId = await addRule();
    const claim = (instant: Date) =>
      claimReminderDelivery(db(), subscriptionId, ruleId, "2026-10-03", now.toISOString(), instant);
    expect((await Promise.all([claim(now), claim(now)])).filter(Boolean)).toHaveLength(1);
    expect(await claim(new Date("2026-10-03T09:04:59.000Z"))).toBeNull();
    const recovered = await claim(new Date("2026-10-03T09:05:00.000Z"));
    expect(recovered).not.toBeNull();
    await db()
      .update(recurringReminderDeliveries)
      .set({ deliveredAt: now })
      .where(eq(recurringReminderDeliveries.id, recovered!.id));
    expect(await claim(new Date("2026-10-03T10:00:00.000Z"))).toBeNull();
  });

  it("retries failed delivery with the same tag and decreasing TTL", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await addRule();
    send.mockRejectedValueOnce({ statusCode: 503 });
    expect(await processRecurringReminders(env(), () => now)).toEqual({ sent: 0, failed: 1 });
    expect(
      await processRecurringReminders(env(), () => new Date("2026-10-03T10:00:00.000Z"))
    ).toEqual({ sent: 1, failed: 0 });
    expect(send.mock.calls[0]?.[2]).toMatchObject({ TTL: 10800 });
    expect(send.mock.calls[1]?.[2]).toMatchObject({ TTL: 7200 });
    expect(JSON.parse(send.mock.calls[0]![1] as string).tag).toBe(
      JSON.parse(send.mock.calls[1]![1] as string).tag
    );
  });

  it("handles before and after offsets without relying on posting nextRunDate", async () => {
    await addRule({
      frequency: "MONTHLY",
      dayOfMonth: 4,
      startDate: "2026-10-04",
      nextRunDate: "2026-11-04",
      reminderSchedules: [{ dayOffset: -1, time: "09:00" }],
    });
    await addRule({
      frequency: "MONTHLY",
      dayOfMonth: 2,
      startDate: "2026-10-02",
      endDate: "2026-10-02",
      nextRunDate: "2026-11-02",
      reminderSchedules: [{ dayOffset: 1, time: "09:00" }],
    });
    await processRecurringReminders(env(), () => now);
    expect(send).toHaveBeenCalledTimes(2);
    const rows = await db().select().from(recurringReminderDeliveries);
    expect(rows.map((row) => row.reminderDate).sort()).toEqual(["2026-10-02", "2026-10-04"]);
  });

  it("keeps the final after-date reminder enabled while preventing postings beyond the end", async () => {
    const ruleId = await addRule({
      startDate: "2020-01-02",
      nextRunDate: "2020-01-02",
      endDate: "2020-01-02",
      reminderSchedules: [{ dayOffset: 1, time: "09:00" }],
    });
    const scope = { mode: "household_user" as const, householdId, userId: ownerId };
    expect(await processDueRecurringRules(env(), db(), scope)).toEqual({ processed: 1, failed: 0 });
    const ended = await db().query.recurringTransactions.findFirst({
      where: eq(recurringTransactions.id, ruleId),
    });
    expect(ended).toMatchObject({
      active: true,
      lastRunDate: "2020-01-02",
      nextRunDate: "2020-01-03",
    });
    expect(await processDueRecurringRules(env(), db(), scope)).toEqual({ processed: 0, failed: 0 });
    const posted = await db()
      .select()
      .from(transactions)
      .where(eq(transactions.householdId, householdId));
    expect(posted.map((row) => row.date)).toEqual(["2020-01-02"]);
    await processRecurringReminders(env(), () => new Date("2020-01-03T09:00:00.000Z"));
    expect(send).toHaveBeenCalledTimes(1);
    await addSubscription(ownerId);
    await db()
      .update(recurringTransactions)
      .set({ active: false })
      .where(eq(recurringTransactions.id, ruleId));
    await processRecurringReminders(env(), () => new Date("2020-01-03T09:01:00.000Z"));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("notifies only a rule's owner, never another household member or an unowned shared rule", async () => {
    const memberId = crypto.randomUUID();
    await db()
      .insert(users)
      .values({
        id: memberId,
        authId: crypto.randomUUID(),
        email: "member@example.com",
        householdId,
        recurringNotifications: true,
        language: "es",
      });
    const memberSub = await addSubscription(memberId);
    await addRule();
    await addRule({ userId: memberId, description: "Salary", type: "income" });
    await addRule({ userId: null });
    await processRecurringReminders(env(), () => now);
    expect(send).toHaveBeenCalledTimes(2);
    const bySub = new Map(
      send.mock.calls.map((call) => [
        call[0].endpoint.split("/").at(-1),
        JSON.parse(call[1] as string),
      ])
    );
    expect(bySub.get(subscriptionId)?.body).toBe("Reminder: Phone bill");
    expect(bySub.get(memberSub)?.body).toBe("Recordatorio: Salary");
  });

  it.each(["canceled", "edited", "paused", "deleted"])(
    "stops retrying a %s rule",
    async (change) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const ruleId = await addRule();
      send.mockRejectedValueOnce({ statusCode: 503 });
      await processRecurringReminders(env(), () => now);
      await db()
        .update(recurringTransactions)
        .set(
          change === "paused"
            ? { active: false }
            : change === "deleted"
              ? { deletedAt: now }
              : {
                  reminderSchedules: change === "canceled" ? [] : [{ dayOffset: 0, time: "10:00" }],
                }
        )
        .where(eq(recurringTransactions.id, ruleId));
      await processRecurringReminders(env(), () => new Date("2026-10-03T09:01:00.000Z"));
      expect(send).toHaveBeenCalledTimes(1);
    }
  );

  it("revalidates rule cancellation between selected times in the same run", async () => {
    const ruleId = await addRule({
      reminderSchedules: [
        { dayOffset: 0, time: "08:00" },
        { dayOffset: 0, time: "09:00" },
      ],
    });
    send.mockImplementationOnce(async () => {
      await db()
        .update(recurringTransactions)
        .set({ reminderSchedules: [] })
        .where(eq(recurringTransactions.id, ruleId));
      return { statusCode: 201, body: "", headers: {} };
    });
    await processRecurringReminders(env(), () => now);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("uses fresh times after a slow first send so expired later-device reminders are skipped", async () => {
    await addRule();
    await addSubscription(ownerId);
    let current = now;
    send.mockImplementationOnce(async () => {
      current = new Date("2026-10-03T12:00:00.000Z");
      return { statusCode: 201, body: "", headers: {} };
    });
    await processRecurringReminders(env(), () => current);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not send automatically without selected schedules or to paused/deleted/ended rules", async () => {
    await addRule({ reminderSchedules: [] });
    await addRule({ active: false });
    await addRule({ deletedAt: now });
    await addRule({ endDate: "2026-10-02" });
    await addRule({ startDate: "2026-10-04" });
    await processRecurringReminders(env(), () => now);
    expect(send).not.toHaveBeenCalled();
  });

  it("skips disabled/deleted recipients, no subscriptions and missing VAPID", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await addRule();
    await processRecurringReminders({ ...env(), VAPID_PRIVATE_KEY: undefined }, () => now);
    await db().update(users).set({ recurringNotifications: false }).where(eq(users.id, ownerId));
    await processRecurringReminders(env(), () => now);
    await db()
      .update(users)
      .set({ recurringNotifications: true, deletedAt: now })
      .where(eq(users.id, ownerId));
    await processRecurringReminders(env(), () => now);
    await db().update(users).set({ deletedAt: null }).where(eq(users.id, ownerId));
    await db().delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptionId));
    await processRecurringReminders(env(), () => now);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send a rule whose owner moved to a different household", async () => {
    const otherHousehold = crypto.randomUUID();
    await db().insert(households).values({ id: otherHousehold, name: "Other" });
    try {
      await addRule();
      await db().update(users).set({ householdId: otherHousehold }).where(eq(users.id, ownerId));
      await processRecurringReminders(env(), () => now);
      expect(send).not.toHaveBeenCalled();
    } finally {
      await db().delete(households).where(eq(households.id, otherHousehold));
    }
  });

  it("moves a DST-gap reminder to the first real minute, using the earlier fold only once", async () => {
    await db()
      .update(households)
      .set({ timezone: "America/Toronto" })
      .where(eq(households.id, householdId));
    const ruleId = await addRule({ reminderSchedules: [{ dayOffset: 0, time: "02:30" }] });
    await processRecurringReminders(env(), () => new Date("2026-03-08T07:00:00.000Z"));
    expect(send).toHaveBeenCalledTimes(1);
    await db()
      .update(recurringTransactions)
      .set({ reminderSchedules: [{ dayOffset: 0, time: "01:30" }] })
      .where(eq(recurringTransactions.id, ruleId));
    await processRecurringReminders(env(), () => new Date("2026-11-01T05:30:00.000Z"));
    await processRecurringReminders(env(), () => new Date("2026-11-01T06:30:00.000Z"));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps grocery preference independent and removes expired devices and old ledgers", async () => {
    const events = [
      {
        type: "add" as const,
        actorUserId: "someone-else",
        actorName: "Ana",
        itemName: "Milk",
        householdId,
        timestamp: 0,
      },
    ];
    await db().update(users).set({ groceryNotifications: false }).where(eq(users.id, ownerId));
    await processPushBatch(env(), householdId, events);
    expect(send).not.toHaveBeenCalled();
    const ruleId = await addRule();
    await claimReminderDelivery(
      db(),
      subscriptionId,
      ruleId,
      "2026-01-01",
      "2026-01-01T09:00:00.000Z",
      new Date("2026-01-01T09:00:00.000Z")
    );
    await pruneRecurringReminderDeliveries(db(), new Date("2026-07-01T00:00:00.000Z"));
    expect(await db().query.recurringReminderDeliveries.findFirst()).toBeUndefined();
    send.mockRejectedValueOnce({ statusCode: 410 });
    await processRecurringReminders(env(), () => now);
    expect(
      await db().query.pushSubscriptions.findFirst({
        where: eq(pushSubscriptions.id, subscriptionId),
      })
    ).toBeUndefined();
    expect(await db().query.recurringReminderDeliveries.findFirst()).toBeUndefined();
  });
});
