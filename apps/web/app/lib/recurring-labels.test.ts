import { describe, expect, it } from "vitest";
import { getFrequencyLabel } from "./recurring-labels";

describe("getFrequencyLabel", () => {
  it("labels daily rules", () => {
    expect(
      getFrequencyLabel({
        frequency: "DAILY",
        interval: 1,
        dayOfMonth: null,
        dayOfWeek: null,
      })
    ).toBe("Daily");
    expect(
      getFrequencyLabel({
        frequency: "DAILY",
        interval: 3,
        dayOfMonth: null,
        dayOfWeek: null,
      })
    ).toBe("Every 3 days");
  });

  it("labels weekly rules with and without a weekday", () => {
    expect(
      getFrequencyLabel({
        frequency: "WEEKLY",
        interval: 1,
        dayOfMonth: null,
        dayOfWeek: 5,
      })
    ).toBe("Every Friday");
    expect(
      getFrequencyLabel({
        frequency: "WEEKLY",
        interval: 2,
        dayOfMonth: null,
        dayOfWeek: 5,
      })
    ).toBe("Every 2 weeks on Friday");
    expect(
      getFrequencyLabel({
        frequency: "WEEKLY",
        interval: 2,
        dayOfMonth: null,
        dayOfWeek: null,
      })
    ).toBe("Every 2 weeks");
    expect(
      getFrequencyLabel({
        frequency: "WEEKLY",
        interval: 1,
        dayOfMonth: null,
        dayOfWeek: null,
      })
    ).toBe("Weekly");
  });

  it("labels monthly rules with ordinal days", () => {
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 1,
        dayOfWeek: null,
      })
    ).toBe("1st of every month");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 2,
        dayOfWeek: null,
      })
    ).toBe("2nd of every month");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 3,
        dayOfWeek: null,
      })
    ).toBe("3rd of every month");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 11,
        dayOfWeek: null,
      })
    ).toBe("11th of every month");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 3,
        dayOfMonth: 15,
        dayOfWeek: null,
      })
    ).toBe("15th every 3 months");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: null,
        dayOfWeek: null,
      })
    ).toBe("Monthly");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 3,
        dayOfMonth: null,
        dayOfWeek: null,
      })
    ).toBe("Every 3 months");
  });

  it("labels yearly rules", () => {
    expect(
      getFrequencyLabel({
        frequency: "YEARLY",
        interval: 1,
        dayOfMonth: null,
        dayOfWeek: null,
      })
    ).toBe("Yearly");
    expect(
      getFrequencyLabel({
        frequency: "YEARLY",
        interval: 2,
        dayOfMonth: null,
        dayOfWeek: null,
      })
    ).toBe("Every 2 years");
  });
});
