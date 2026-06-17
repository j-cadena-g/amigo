import { describe, expect, it } from "vitest";
import { getRecurringOccurrences } from "./calendar";

describe("calendar recurring expansion", () => {
  it("caps work for legacy rules with ancient nextRunDate", () => {
    const events = getRecurringOccurrences(
      {
        id: "ancient-rule",
        category: "legacy",
        description: null,
        amount: 1000,
        currency: "CAD",
        type: "expense",
        frequency: "DAILY",
        interval: 1,
        startDate: "0001-01-01",
        endDate: null,
        nextRunDate: "0001-01-01",
        lastRunDate: null,
        dayOfMonth: null,
        active: true,
      },
      new Date(Date.UTC(2026, 5, 1)),
      new Date(Date.UTC(2026, 5, 30))
    );

    expect(events).toEqual([]);
  });
});
