import {
  and,
  auditLogs,
  eq,
  households,
  isNull,
  recurringTransactions,
  scopeToHousehold,
  transactions,
  users,
  type RecurringTransaction,
} from "@amigo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDb,
  seedFinancialCategory,
  seedExpenseTransaction,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import { handleRecurringRequest } from "./recurring";
import {
  buildRecurringOccurrenceTransactionId,
  processDueRecurringRules,
} from "../lib/recurring-processor";

describe("explicit recurring reminder schedules", () => {
  let householdId: string;
  let ownerId: string;
  let categoryId: string;
  let incomeCategoryId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-rule-reminders-${suffix}`;
    ownerId = `user-rule-reminders-${suffix}`;
    categoryId = crypto.randomUUID();
    incomeCategoryId = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, { householdId, ownerId, ownerAuthId: `clerk_rule_reminders_${suffix}` });
    await seedFinancialCategory(db, { id: categoryId, householdId, name: "Rent" });
    await seedFinancialCategory(db, { id: incomeCategoryId, householdId, name: "Salary", type: "income" });
  });

  function call(
    method: "GET" | "POST" | "PATCH",
    body?: unknown,
    id?: string,
    session = testSession({ userId: ownerId, householdId })
  ) {
    return handleRecurringRequest({
      env: getIntegrationEnv(),
      params: { "*": id ?? "" },
      request: new Request(`http://localhost/api/recurring${id ? `/${id}` : ""}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
  }

  async function create(extra: Record<string, unknown> = {}): Promise<RecurringTransaction> {
    const response = await call("POST", {
      amount: 40,
      categoryId,
      type: "expense",
      frequency: "MONTHLY",
      startDate: "2100-01-01",
      ...extra,
    });
    expect(response.status).toBe(201);
    return await response.json() as RecurringTransaction;
  }

  async function stored(id: string) {
    return createTestDb(getIntegrationEnv().DB).query.recurringTransactions.findFirst({
      where: and(
        eq(recurringTransactions.id, id),
        scopeToHousehold(recurringTransactions.householdId, householdId),
        isNull(recurringTransactions.deletedAt)
      ),
    });
  }

  it("defaults to no reminder schedules", async () => {
    const rule = await create();
    expect(rule.reminderSchedules).toEqual([]);
    expect((await stored(rule.id))?.reminderSchedules).toEqual([]);
  });

  it.each(["expense", "income"] as const)("stores four sorted %s reminders and returns them in the list", async (type) => {
    const reminderSchedules = [
      { dayOffset: 2, time: "20:00" },
      { dayOffset: -1, time: "09:00" },
      { dayOffset: 0, time: "23:59" },
      { dayOffset: 0, time: "08:00" },
    ];
    const expected = [reminderSchedules[1], reminderSchedules[3], reminderSchedules[2], reminderSchedules[0]];
    const rule = await create({ type, categoryId: type === "income" ? incomeCategoryId : categoryId, reminderSchedules, userId: "spoofed-recipient" });
    expect(rule.reminderSchedules).toEqual(expected);
    expect(rule.userId).toBe(ownerId);
    expect(rule.amount).toBe(4000);
    const rules = await (await call("GET")).json() as RecurringTransaction[];
    expect(rules.find((row) => row.id === rule.id)?.reminderSchedules).toEqual(expected);
    const db = createTestDb(getIntegrationEnv().DB);
    const audit = await db.query.auditLogs.findFirst({
      where: and(scopeToHousehold(auditLogs.householdId, householdId), eq(auditLogs.recordId, rule.id), eq(auditLogs.operation, "INSERT")),
    });
    expect(audit?.newValues).toMatchObject({ reminderSchedules: expected, userId: ownerId });
  });

  it("preserves omitted schedules and recipient, and clears schedules explicitly", async () => {
    const reminderSchedules = [{ dayOffset: -1, time: "09:00" }];
    const rule = await create({ reminderSchedules });
    const edited = await (await call("PATCH", { amount: 50, userId: "spoofed-recipient" }, rule.id)).json() as RecurringTransaction;
    expect(edited.reminderSchedules).toEqual(reminderSchedules);
    expect(edited.userId).toBe(ownerId);
    const changed = await (await call("PATCH", { reminderSchedules: [{ dayOffset: 1, time: "12:00" }] }, rule.id)).json() as RecurringTransaction;
    expect(changed.reminderSchedules).toEqual([{ dayOffset: 1, time: "12:00" }]);
    expect(changed.userId).toBe(ownerId);
    const cleared = await (await call("PATCH", { reminderSchedules: [] }, rule.id)).json() as RecurringTransaction;
    expect(cleared.reminderSchedules).toEqual([]);
    expect(cleared.userId).toBe(ownerId);
    expect(cleared.amount).toBe(5000);
  });

  it.each([
    { schedules: Array.from({ length: 5 }, (_, dayOffset) => ({ dayOffset, time: "09:00" })), reason: "more than four" },
    { schedules: [{ dayOffset: -1, time: "09:00" }, { dayOffset: -1, time: "09:00" }], reason: "duplicates" },
    { schedules: [{ dayOffset: 0, time: "24:00" }], reason: "invalid hour" },
    { schedules: [{ dayOffset: 0, time: "09:60" }], reason: "invalid minute" },
    { schedules: [{ dayOffset: 0, time: "9:00" }], reason: "unpadded time" },
    { schedules: [{ dayOffset: 0.5, time: "09:00" }], reason: "fractional offset" },
    { schedules: [{ dayOffset: -36601, time: "09:00" }], reason: "offset below minimum" },
    { schedules: [{ dayOffset: 36601, time: "09:00" }], reason: "offset above maximum" },
  ])("rejects $reason on create and update without altering schedules", async ({ schedules }) => {
    await expect(create({ reminderSchedules: schedules })).rejects.toMatchObject({ name: "ZodError" });
    const rule = await create();
    await expect(call("PATCH", { reminderSchedules: schedules }, rule.id)).rejects.toMatchObject({ name: "ZodError" });
    expect((await stored(rule.id))?.reminderSchedules).toEqual([]);
  });

  it("does not allow another household or member to edit reminder schedules", async () => {
    const reminderSchedules = [{ dayOffset: -1, time: "09:00" }];
    const rule = await create({ reminderSchedules });
    const db = createTestDb(getIntegrationEnv().DB);
    const otherHouseholdId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    await seedHouseholdWithOwner(db, { householdId: otherHouseholdId, ownerId: otherUserId, ownerAuthId: `clerk_other_${otherUserId}` });
    await expect(call("PATCH", { reminderSchedules: [] }, rule.id, testSession({ householdId: otherHouseholdId, userId: otherUserId }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    const memberId = crypto.randomUUID();
    await db.insert(users).values({ id: memberId, authId: `clerk_member_${memberId}`, email: "member@example.com", householdId });
    await expect(call("PATCH", { reminderSchedules: [] }, rule.id, testSession({ householdId, userId: memberId, role: "member" }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await stored(rule.id))?.reminderSchedules).toEqual(reminderSchedules);
    expect((await stored(rule.id))?.userId).toBe(ownerId);
  });

  it("rejects reminder changes for a deleted rule", async () => {
    const rule = await create();
    await createTestDb(getIntegrationEnv().DB).update(recurringTransactions).set({ deletedAt: new Date() }).where(eq(recurringTransactions.id, rule.id));
    await expect(call("PATCH", { reminderSchedules: [{ dayOffset: -1, time: "09:00" }] }, rule.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([true, false])("preserves active=%s for an ended rule without posting another occurrence", async (active) => {
    const db = createTestDb(getIntegrationEnv().DB);
    const ruleId = crypto.randomUUID();
    const lastOccurrenceDate = "2000-01-05";
    const occurrenceId = buildRecurringOccurrenceTransactionId(ruleId, lastOccurrenceDate);
    await db.insert(recurringTransactions).values({
      id: ruleId,
      householdId,
      userId: ownerId,
      amount: 4000,
      currency: "CAD",
      categoryId,
      category: "Rent",
      type: "expense",
      frequency: "DAILY",
      interval: 1,
      startDate: "2000-01-01",
      endDate: lastOccurrenceDate,
      lastRunDate: lastOccurrenceDate,
      nextRunDate: "2000-01-06",
      active,
    });
    await seedExpenseTransaction(db, {
      id: occurrenceId,
      householdId,
      userId: ownerId,
      amount: 4000,
      category: "Rent",
      categoryId,
      date: lastOccurrenceDate,
    });

    const reminderSchedules = [{ dayOffset: 1, time: "09:00" }];
    const reminderEdit = await (await call("PATCH", { reminderSchedules }, ruleId)).json() as RecurringTransaction;
    expect(reminderEdit.active).toBe(active);
    expect(reminderEdit.nextRunDate).toBe("2000-01-06");
    expect(reminderEdit.reminderSchedules).toEqual(reminderSchedules);
    expect(await processDueRecurringRules(getIntegrationEnv(), db, {
      mode: "household_user",
      householdId,
      userId: ownerId,
    })).toEqual({ processed: 0, failed: 0 });

    const scheduleEdit = await (await call("PATCH", {
      amount: 50,
      frequency: "DAILY",
      interval: 1,
      startDate: "2000-01-01",
      endDate: lastOccurrenceDate,
      reminderSchedules,
    }, ruleId)).json() as RecurringTransaction;
    expect(scheduleEdit.active).toBe(active);
    expect(scheduleEdit.nextRunDate > lastOccurrenceDate).toBe(true);
    expect(scheduleEdit.lastRunDate).toBe(lastOccurrenceDate);
    expect(scheduleEdit.reminderSchedules).toEqual(reminderSchedules);
    expect(await processDueRecurringRules(getIntegrationEnv(), db, {
      mode: "household_user",
      householdId,
      userId: ownerId,
    })).toEqual({ processed: 0, failed: 0 });

    const occurrences = await db.query.transactions.findMany({
      columns: { id: true },
      where: and(
        scopeToHousehold(transactions.householdId, householdId),
        isNull(transactions.deletedAt)
      ),
    });
    expect(occurrences).toEqual([{ id: occurrenceId }]);
    expect((await stored(ruleId))?.active).toBe(active);
  });

  it.each([
    { timeZone: "America/Toronto", now: "2026-10-04T00:30:00.000Z", today: "2026-10-03" },
    { timeZone: "Asia/Tokyo", now: "2026-10-03T23:30:00.000Z", today: "2026-10-04" },
  ])("creates and updates using $timeZone today, including end-date bounds and exhaustion", async ({ timeZone, now, today }) => {
    const db = createTestDb(getIntegrationEnv().DB);
    await db.update(households).set({ timezone: timeZone }).where(scopeToHousehold(households.id, householdId));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    try {
      const rule = await create({ frequency: "DAILY", startDate: "2026-10-01", endDate: today });
      expect(rule.nextRunDate).toBe(today);
      expect((await stored(rule.id))?.nextRunDate).toBe(today);

      const edited = await (await call("PATCH", {
        frequency: "DAILY",
        startDate: "2026-10-01",
        endDate: today,
      }, rule.id)).json() as RecurringTransaction;
      expect(edited.nextRunDate).toBe(today);
      expect((await stored(rule.id))?.nextRunDate).toBe(today);

      const yesterday = new Date(`${today}T00:00:00.000Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const exhausted = await (await call("PATCH", {
        endDate: yesterday.toISOString().slice(0, 10),
      }, rule.id)).json() as RecurringTransaction;
      expect(exhausted.nextRunDate).toBe(today);
      expect(exhausted.active).toBe(true);
      expect((await stored(rule.id))?.nextRunDate).toBe(today);

      await expect(create({
        frequency: "DAILY",
        startDate: "2026-10-01",
        endDate: yesterday.toISOString().slice(0, 10),
      })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    } finally {
      vi.useRealTimers();
    }
  });
});
