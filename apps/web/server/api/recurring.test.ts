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
