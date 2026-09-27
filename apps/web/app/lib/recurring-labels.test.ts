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
      }, "en")
    ).toBe("Daily");
    expect(
      getFrequencyLabel({
        frequency: "DAILY",
        interval: 3,
        dayOfMonth: null,
        dayOfWeek: null,
      }, "en")
    ).toBe("Every 3 days");
  });

  it("labels weekly rules with and without a weekday", () => {
    expect(
      getFrequencyLabel({
        frequency: "WEEKLY",
        interval: 1,
        dayOfMonth: null,
        dayOfWeek: 5,
      }, "en")
    ).toBe("Every Friday");
    expect(
      getFrequencyLabel({
        frequency: "WEEKLY",
        interval: 2,
        dayOfMonth: null,
        dayOfWeek: 5,
      }, "en")
    ).toBe("Every 2 weeks on Friday");
    expect(
      getFrequencyLabel({
        frequency: "WEEKLY",
        interval: 2,
        dayOfMonth: null,
        dayOfWeek: null,
      }, "en")
    ).toBe("Every 2 weeks");
    expect(
      getFrequencyLabel({
        frequency: "WEEKLY",
        interval: 1,
        dayOfMonth: null,
        dayOfWeek: null,
      }, "en")
    ).toBe("Weekly");
  });

  it("labels monthly rules with ordinal days", () => {
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 1,
        dayOfWeek: null,
      }, "en")
    ).toBe("1st of every month");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 2,
        dayOfWeek: null,
      }, "en")
    ).toBe("2nd of every month");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 3,
        dayOfWeek: null,
      }, "en")
    ).toBe("3rd of every month");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 11,
        dayOfWeek: null,
      }, "en")
    ).toBe("11th of every month");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 3,
        dayOfMonth: 15,
        dayOfWeek: null,
      }, "en")
    ).toBe("15th every 3 months");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 31,
        dayOfWeek: null,
      }, "en")
    ).toBe("Last day of every month");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 2,
        dayOfMonth: 31,
        dayOfWeek: null,
      }, "en")
    ).toBe("Last day every 2 months");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 30,
        dayOfWeek: null,
      }, "en")
    ).toBe("30th of every month");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: null,
        dayOfWeek: null,
      }, "en")
    ).toBe("Monthly");
    expect(
      getFrequencyLabel({
        frequency: "MONTHLY",
        interval: 3,
        dayOfMonth: null,
        dayOfWeek: null,
      }, "en")
    ).toBe("Every 3 months");
  });

  it("labels yearly rules", () => {
    expect(
      getFrequencyLabel({
        frequency: "YEARLY",
        interval: 1,
        dayOfMonth: null,
        dayOfWeek: null,
      }, "en")
    ).toBe("Yearly");
    expect(
      getFrequencyLabel({
        frequency: "YEARLY",
        interval: 2,
        dayOfMonth: null,
        dayOfWeek: null,
      }, "en")
    ).toBe("Every 2 years");
  });

  it("reads naturally in Spanish", () => {
    const es = (rule: Parameters<typeof getFrequencyLabel>[0]) => getFrequencyLabel(rule, "es");
    expect(es({ frequency: "DAILY", interval: 1, dayOfMonth: null, dayOfWeek: null })).toBe("Diario");
    expect(es({ frequency: "WEEKLY", interval: 1, dayOfMonth: null, dayOfWeek: 1 })).toBe(
      "Todos los lunes"
    );
    expect(es({ frequency: "WEEKLY", interval: 1, dayOfMonth: null, dayOfWeek: 6 })).toBe(
      "Todos los sábados"
    );
    expect(es({ frequency: "WEEKLY", interval: 2, dayOfMonth: null, dayOfWeek: 5 })).toBe(
      "Cada 2 semanas, el viernes"
    );
    expect(es({ frequency: "MONTHLY", interval: 1, dayOfMonth: 15, dayOfWeek: null })).toBe(
      "El 15 de cada mes"
    );
    expect(es({ frequency: "MONTHLY", interval: 1, dayOfMonth: 31, dayOfWeek: null })).toBe(
      "El último día de cada mes"
    );
    expect(es({ frequency: "YEARLY", interval: 3, dayOfMonth: null, dayOfWeek: null })).toBe(
      "Cada 3 años"
    );
  });
});
