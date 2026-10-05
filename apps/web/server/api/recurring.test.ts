import { describe, expect, it } from "vitest";
import { createRuleSchema, updateRuleSchema } from "./recurring";

describe("createRuleSchema", () => {
  const base = {
    amount: 2009,
    categoryId: "00000000-0000-4000-8000-000000000001",
    type: "expense" as const,
    frequency: "MONTHLY" as const,
    startDate: "2026-05-20",
  };

  it("accepts null description with numeric dayOfMonth (client payload)", () => {
    expect(
      createRuleSchema.parse({
        ...base,
        description: null,
        dayOfMonth: 1,
        endDate: null,
        budgetId: null,
      })
    ).toMatchObject({
      description: null,
      dayOfMonth: 1,
      endDate: null,
      budgetId: null,
    });
  });

  it("accepts weekly schedule with null dayOfMonth", () => {
    expect(
      createRuleSchema.parse({
        ...base,
        frequency: "WEEKLY",
        interval: 1,
        dayOfMonth: null,
      })
    ).toMatchObject({
      frequency: "WEEKLY",
      dayOfMonth: null,
    });
  });

  it("rejects ancient start dates", () => {
    expect(() =>
      createRuleSchema.parse({
        ...base,
        startDate: "1999-12-31",
      })
    ).toThrow(/startDate must be between 2000-01-01 and 2100-12-31/);
  });
});

describe("updateRuleSchema", () => {
  it("accepts the edit-dialog payload including dollar amounts and dayOfWeek", () => {
    expect(
      updateRuleSchema.parse({
        type: "expense",
        amount: 45.5,
        currency: "CAD",
        categoryId: "00000000-0000-4000-8000-000000000001",
        description: "Rent",
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 1,
        dayOfWeek: null,
        startDate: "2026-01-15",
        endDate: null,
        budgetId: "00000000-0000-4000-8000-000000000002",
      })
    ).toMatchObject({
      amount: 45.5,
      dayOfMonth: 1,
      startDate: new Date("2026-01-15"),
      budgetId: "00000000-0000-4000-8000-000000000002",
    });
  });
});

describe("recurring reminder schedule validation", () => {
  const base = {
    amount: 40,
    categoryId: "00000000-0000-4000-8000-000000000001",
    type: "expense",
    frequency: "MONTHLY",
    startDate: "2100-01-01",
  };

  it("sorts four unique before, on and after occurrence reminders", () => {
    const reminderSchedules = [
      { dayOffset: 1, time: "08:00" },
      { dayOffset: 0, time: "23:59" },
      { dayOffset: -1, time: "09:00" },
      { dayOffset: 0, time: "00:00" },
    ];
    const expected = [reminderSchedules[2], reminderSchedules[3], reminderSchedules[1], reminderSchedules[0]];
    expect(createRuleSchema.parse({ ...base, reminderSchedules }).reminderSchedules).toEqual(expected);
    expect(updateRuleSchema.parse({ reminderSchedules }).reminderSchedules).toEqual(expected);
  });

  it("accepts the supported offset bounds and empty or omitted reminders", () => {
    expect(updateRuleSchema.parse({ reminderSchedules: [
      { dayOffset: -36600, time: "00:00" },
      { dayOffset: 36600, time: "23:59" },
    ] }).reminderSchedules).toHaveLength(2);
    expect(createRuleSchema.parse(base).reminderSchedules).toBeUndefined();
    expect(updateRuleSchema.parse({ reminderSchedules: [] }).reminderSchedules).toEqual([]);
  });

  it.each([
    { schedules: Array.from({ length: 5 }, (_, dayOffset) => ({ dayOffset, time: "09:00" })), reason: "more than four" },
    { schedules: [{ dayOffset: -1, time: "09:00" }, { dayOffset: -1, time: "09:00" }], reason: "duplicate pairs" },
    { schedules: [{ dayOffset: 0, time: "24:00" }], reason: "out-of-range hour" },
    { schedules: [{ dayOffset: 0, time: "09:60" }], reason: "out-of-range minute" },
    { schedules: [{ dayOffset: 0, time: "9:00" }], reason: "unpadded hour" },
    { schedules: [{ dayOffset: 0, time: "09:00:00" }], reason: "seconds" },
    { schedules: [{ dayOffset: 0, time: "09:00Z" }], reason: "UTC suffix" },
    { schedules: [{ dayOffset: 0.5, time: "09:00" }], reason: "fractional offset" },
    { schedules: [{ dayOffset: -36601, time: "09:00" }], reason: "too early offset" },
    { schedules: [{ dayOffset: 36601, time: "09:00" }], reason: "too late offset" },
    { schedules: [{ dayOffset: "-1", time: "09:00" }], reason: "string offset" },
    { schedules: [{ dayOffset: 0, time: "09:00", userId: "someone-else" }], reason: "unexpected reminder fields" },
  ])("rejects $reason on create and update", ({ schedules }) => {
    expect(() => createRuleSchema.parse({ ...base, reminderSchedules: schedules })).toThrow();
    expect(() => updateRuleSchema.parse({ reminderSchedules: schedules })).toThrow();
  });
});
