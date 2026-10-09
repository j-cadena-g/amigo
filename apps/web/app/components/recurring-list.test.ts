import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LanguageContext } from "@/app/i18n";
import { RecurringRuleRow } from "./recurring-list";

type RowProps = ComponentProps<typeof RecurringRuleRow>;

function renderRule(overrides: Partial<RowProps["rule"]> = {}, language: "en" | "es" = "en") {
  const props: RowProps = {
    rule: {
      id: "rule", householdId: "household", userId: null, amount: 10000, currency: "CAD",
      categoryId: "category", category: "Rent", description: null, type: "expense",
      frequency: "MONTHLY", interval: 1, dayOfMonth: 1, dayOfWeek: null,
      startDate: "2026-01-01", endDate: "2026-10-01", nextRunDate: "2026-11-01",
      isActive: true, budgetId: null, accountId: null, createdAt: 0,
      reminderSchedules: [{ dayOffset: 2, time: "09:00" }],
      ...overrides,
    },
    homeCurrency: "CAD", timeZone: "America/Toronto", toggling: false, deleting: false,
    onToggle() {}, onEdit() {}, onDelete() {},
  };
  return renderToStaticMarkup(createElement(LanguageContext.Provider, {
    value: language,
  }, createElement(RecurringRuleRow, props)));
}

describe("recurring completion status", () => {
  it("shows natural completion without advertising a next occurrence beyond the end date", () => {
    const markup = renderRule();
    expect(markup).toContain("Ended");
    expect(markup).toContain("Final occurrence completed");
    expect(markup).not.toContain("Next");
    expect(markup).toContain("Pause reminders for Rent");
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain("2 days after at 09:00");
  });

  it("keeps the end date inclusive and unbounded rules running", () => {
    for (const overrides of [{ nextRunDate: "2026-10-01" }, { endDate: null }]) {
      const markup = renderRule(overrides);
      expect(markup).toContain("Next");
      expect(markup).not.toContain("Final occurrence completed");
    }
  });

  it("leaves explicitly paused and previously inactivated rules paused", () => {
    const markup = renderRule({ isActive: false });
    expect(markup).toContain("Paused");
    expect(markup).not.toContain("Final occurrence completed");
    expect(markup).toContain("Resume reminders for Rent");
    expect(markup).toContain('aria-checked="false"');
  });

  it("provides completion and reminder pause copy in Spanish", () => {
    const markup = renderRule({}, "es");
    expect(markup).toContain("Finalizado");
    expect(markup).toContain("Último movimiento completado");
    expect(markup).toContain("Pausar recordatorios de Rent");
  });
});
