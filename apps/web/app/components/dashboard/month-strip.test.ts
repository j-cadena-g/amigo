import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildMonthStrip, describeStripDay } from "@/app/lib/month-strip";
import { MonthStrip } from "./month-strip";

const events = [
  {
    id: "t1",
    type: "transaction" as const,
    date: "2026-09-12",
    title: "Coffee",
    color: "red" as const,
    metadata: { amount: 450, currency: "CAD", transactionType: "expense" as const },
  },
  {
    id: "t2",
    type: "transaction" as const,
    date: "2026-09-12",
    title: "Pay",
    color: "green" as const,
    metadata: { amount: 2000, currency: "CAD", transactionType: "income" as const },
  },
];

describe("MonthStrip", () => {
  it("starts on today and speaks the day's money through the scrubber", () => {
    const html = renderToStaticMarkup(
      React.createElement(MonthStrip, {
        events,
        month: "2026-09",
        todayStr: "2026-09-12",
        currency: "CAD",
      })
    );
    const today = buildMonthStrip({
      events,
      month: "2026-09",
      todayStr: "2026-09-12",
      homeCurrency: "CAD",
    }).days[11]!;

    expect(html).toContain('type="range"');
    expect(html).toContain('value="12"');
    expect(html).toContain(`aria-valuetext="${describeStripDay(today, "CAD")}"`);
    expect(html).toContain("Open day");
  });

  it("offers no day to open when nothing happened", () => {
    const html = renderToStaticMarkup(
      React.createElement(MonthStrip, {
        events: [],
        month: "2026-09",
        todayStr: "2026-09-12",
        currency: "CAD",
      })
    );

    expect(html).toContain("nothing recorded");
    expect(html).not.toContain("Open day");
  });
});
