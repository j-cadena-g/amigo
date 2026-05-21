import { describe, expect, it } from "vitest";
import { createRuleSchema } from "./recurring";

describe("createRuleSchema", () => {
  const base = {
    amount: 2009,
    category: "Rent",
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
});
