import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { messagesFor } from "@/app/i18n";
import { buildMonthStrip, describeStripDay, type CalendarEvent } from "@/app/lib/month-strip";
import { MonthCalendar } from "./month-calendar";

const events: CalendarEvent[] = [
  {
    id: "t1",
    type: "transaction",
    date: "2026-09-12",
    title: "Coffee",
    color: "red",
    metadata: { amount: 450, currency: "CAD", transactionType: "expense" },
  },
  {
    id: "r1",
    type: "recurring",
    date: "2026-09-28",
    title: "Rent",
    color: "red",
    metadata: { amount: 1_250_00, currency: "CAD", transactionType: "expense" },
  },
];

function render(list: CalendarEvent[]) {
  return renderToStaticMarkup(
    React.createElement(MonthCalendar, {
      events: list,
      month: "2026-09",
      todayStr: "2026-09-12",
      currency: "CAD",
    })
  );
}

describe("MonthCalendar", () => {
  it("lays out the month with spending and bills due on their days", () => {
    const html = render(events);
    const strip = buildMonthStrip({
      events,
      month: "2026-09",
      todayStr: "2026-09-12",
      homeCurrency: "CAD",
    });

    expect(html).toContain("September 2026");
    expect(html.match(/class="border-r border-b border-border"><\/div>/g)?.length).toBe(2);
    expect(html).toContain(`aria-label="${describeStripDay(strip.days[11]!, "CAD", "en-CA", messagesFor("en").calendar)}"`);
    expect(html).toContain("bg-tag");
    expect(html).toContain("$1.3K");
    expect(html).toContain("$1,250.00 due for the rest of September.");
    expect(html).not.toContain("This month");
  });

  it("disables days with nothing to open", () => {
    const html = render([]);
    expect(html.match(/disabled=""/g)?.length).toBe(30);
    expect(html).toContain("Nothing scheduled for the rest of September.");
  });

  it("shows money received and money still expected on the same day", () => {
    const html = render([
      {
        id: "t-pay",
        type: "transaction",
        date: "2026-09-15",
        title: "Freelance",
        color: "green",
        metadata: { amount: 300_00, currency: "CAD", transactionType: "income" },
      },
      {
        id: "r-pay",
        type: "recurring",
        date: "2026-09-15",
        title: "Salary",
        color: "green",
        metadata: { amount: 2_000_00, currency: "CAD", transactionType: "income" },
      },
    ]);

    expect(html).toContain("$300");
    expect(html).toContain("$2K");
  });
});
