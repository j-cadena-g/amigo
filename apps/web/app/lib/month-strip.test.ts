import { describe, expect, it } from "vitest";
import {
  buildMonthStrip,
  describeStripDay,
  normalizeEventDate,
  type CalendarEvent,
} from "./month-strip";

function event(
  overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "date">
): CalendarEvent {
  return {
    id: `${overrides.date}-${Math.random()}`,
    type: "transaction",
    title: "Entry",
    color: "red",
    ...overrides,
  };
}

function money(
  date: string,
  amount: number,
  transactionType: "income" | "expense",
  type: CalendarEvent["type"] = "transaction",
  currency = "CAD"
): CalendarEvent {
  return event({ date, type, metadata: { amount, currency, transactionType } });
}

describe("buildMonthStrip", () => {
  it("has one entry per day of the month", () => {
    const september = buildMonthStrip({
      events: [],
      month: "2026-09",
      todayStr: "2026-09-24",
      homeCurrency: "CAD",
    });
    const february = buildMonthStrip({
      events: [],
      month: "2027-02",
      todayStr: "2026-09-24",
      homeCurrency: "CAD",
    });

    expect(september.days).toHaveLength(30);
    expect(september.days[0]).toMatchObject({ date: "2026-09-01", day: 1 });
    expect(september.days[29]).toMatchObject({ date: "2026-09-30", day: 30 });
    expect(february.days).toHaveLength(28);
  });

  it("separates posted and scheduled money in the home currency", () => {
    const strip = buildMonthStrip({
      events: [
        money("2026-09-01", 185000, "expense"),
        money("2026-09-01", 285000, "income"),
        money("2026-09-01", 1299, "expense", "recurring"),
        money("2026-09-01", 5000, "expense", "transaction", "USD"),
        event({ date: "2026-09-01", type: "grocery_purchase", color: "orange" }),
        money("2026-09-30", 285000, "income", "recurring"),
      ],
      month: "2026-09",
      todayStr: "2026-09-24",
      homeCurrency: "CAD",
    });

    expect(strip.days[0]).toMatchObject({
      spentCents: 185000,
      receivedCents: 285000,
      scheduledSpentCents: 1299,
      scheduledReceivedCents: 0,
    });
    expect(strip.days[0]!.events).toHaveLength(5);
    expect(strip.days[29]).toMatchObject({
      spentCents: 0,
      scheduledReceivedCents: 285000,
    });
  });

  it("marks today and the days after it", () => {
    const strip = buildMonthStrip({
      events: [],
      month: "2026-09",
      todayStr: "2026-09-24",
      homeCurrency: "CAD",
    });

    expect(strip.days[22]).toMatchObject({ isToday: false, isFuture: false });
    expect(strip.days[23]).toMatchObject({ isToday: true, isFuture: false });
    expect(strip.days[24]).toMatchObject({ isToday: false, isFuture: true });
  });

  it("scales against the largest posted or scheduled spending day", () => {
    const strip = buildMonthStrip({
      events: [
        money("2026-09-03", 12745, "expense"),
        money("2026-09-28", 14200, "expense", "recurring"),
        money("2026-09-15", 285000, "income"),
      ],
      month: "2026-09",
      todayStr: "2026-09-24",
      homeCurrency: "CAD",
    });

    expect(strip.maxSpentCents).toBe(14200);
  });
});

describe("normalizeEventDate", () => {
  it("keeps ISO dates and converts millisecond timestamps to a UTC day", () => {
    expect(normalizeEventDate("2026-09-20")).toBe("2026-09-20");
    expect(normalizeEventDate("2026-09-20T15:00:00Z")).toBe("2026-09-20");
    expect(normalizeEventDate(String(Date.UTC(2026, 8, 22, 18)))).toBe("2026-09-22");
  });
});

describe("describeStripDay", () => {
  it("reads out the day's money and entry count", () => {
    const strip = buildMonthStrip({
      events: [
        money("2026-09-20", 9812, "expense"),
        money("2026-09-20", 2000, "income"),
      ],
      month: "2026-09",
      todayStr: "2026-09-24",
      homeCurrency: "CAD",
    });

    expect(describeStripDay(strip.days[19]!, "CAD")).toBe(
      "Sun, Sep 20 · spent $98.12 · received $20.00 · 2 entries"
    );
    expect(describeStripDay(strip.days[20]!, "CAD")).toBe(
      "Mon, Sep 21 · nothing recorded"
    );
  });

  it("names scheduled bills as due and scheduled pay as expected", () => {
    const strip = buildMonthStrip({
      events: [
        money("2026-09-28", 14200, "expense", "recurring"),
        money("2026-09-30", 285000, "income", "recurring"),
      ],
      month: "2026-09",
      todayStr: "2026-09-24",
      homeCurrency: "CAD",
    });

    expect(describeStripDay(strip.days[27]!, "CAD")).toBe(
      "Mon, Sep 28 · $142.00 due · 1 entry"
    );
    expect(describeStripDay(strip.days[29]!, "CAD")).toBe(
      "Wed, Sep 30 · $2,850.00 expected · 1 entry"
    );
  });
});
