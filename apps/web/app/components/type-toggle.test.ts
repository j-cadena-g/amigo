import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TypeToggle } from "./type-toggle";

const options = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const;

function render(value: "expense" | "income") {
  return renderToStaticMarkup(
    React.createElement(TypeToggle<"expense" | "income">, {
      label: "Transaction type",
      options,
      value,
      onChange: () => {},
    })
  );
}

describe("TypeToggle", () => {
  it("renders a labelled radio group with one radio per option", () => {
    const html = render("expense");

    expect(html).toMatch(/^<div role="radiogroup" aria-label="Transaction type"/);
    expect(html.match(/role="radio"/g)).toHaveLength(2);
  });

  it("checks the selected option and makes only it tabbable", () => {
    const html = render("income");

    expect(html).toMatch(/aria-checked="false" tabindex="-1"[^>]*>Expense</);
    expect(html).toMatch(/aria-checked="true" tabindex="0"[^>]*>Income</);
  });

  it("fills only the selected segment with ink", () => {
    const html = render("expense");
    const [expense, income] = html.split("</button>");

    expect(expense).toContain("bg-primary");
    expect(income).not.toContain("bg-primary");
  });
});
