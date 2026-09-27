import { describe, expect, it } from "vitest";
import {
  formatMonthInSentence,
  formatMonthLabel,
  leadingBlankDays,
  scheduledAhead,
  shiftMonth,
  weekdayHeaders,
} from "./month-calendar";
import { buildMonthStrip, type CalendarEvent } from "./month-strip";

function scheduled(
  date: string,
  amount: number,
  transactionType: "income" | "expense"
): CalendarEvent {
  return {
    id: `${date}-${transactionType}`,
    type: "recurring",
    date,
    title: "Rule",
    color: transactionType === "income" ? "green" : "red",
    metadata: { amount, currency: "CAD", transactionType },
  };
}

describe("shiftMonth", () => {
  it("crosses year boundaries both ways", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
  });
});

describe("formatMonthLabel", () => {
  it("names the month and year", () => {
    expect(formatMonthLabel("2026-09", "en-CA")).toBe("September 2026");
  });
});

describe("leadingBlankDays", () => {
  it("counts the weekdays before the 1st, Sunday first", () => {
    expect(leadingBlankDays("2026-09")).toBe(2); // Tue
    expect(leadingBlankDays("2026-02")).toBe(0); // Sun
    expect(leadingBlankDays("2026-08")).toBe(6); // Sat
  });
});

describe("scheduledAhead", () => {
  it("sums scheduled money from today to month end", () => {
    const { days } = buildMonthStrip({
      events: [
        scheduled("2026-09-01", 99_00, "expense"),
        scheduled("2026-09-12", 1_250_00, "expense"),
        scheduled("2026-09-30", 45_00, "expense"),
        scheduled("2026-09-15", 2_000_00, "income"),
      ],
      month: "2026-09",
      todayStr: "2026-09-12",
      homeCurrency: "CAD",
    });

    expect(scheduledAhead(days, "2026-09-12")).toEqual({
      dueCents: 1_295_00,
      expectedCents: 2_000_00,
    });
  });
});

describe("localized month and weekday names", () => {
  it("capitalizes headings but not mid-sentence months", () => {
    expect(formatMonthLabel("2026-09", "es-CO")).toBe("Septiembre de 2026");
    expect(formatMonthInSentence("2026-09", "es-CO")).toBe("septiembre");
    expect(formatMonthInSentence("2026-10", "es-CO", { withYear: true })).toBe(
      "octubre de 2026"
    );
    expect(formatMonthInSentence("2026-09", "en-CA")).toBe("September");
  });

  it("lists weekdays Sunday first in the viewer's language", () => {
    expect(weekdayHeaders("en-CA")).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(weekdayHeaders("es-CO")).toEqual(["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]);
  });
});
