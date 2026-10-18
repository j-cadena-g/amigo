import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToastView, type ToastItem } from "./toast-provider";

function render(toast: ToastItem) {
  return renderToStaticMarkup(createElement(ToastView, { toast, onDismiss() {} }));
}

describe("ToastView", () => {
  it("is a single tap-to-dismiss button without an action", () => {
    const markup = render({ id: "t", message: "Saved", variant: "default" });

    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).toContain("Saved");
  });

  it("puts the action in its own named button next to the message", () => {
    const markup = render({
      id: "t",
      message: "Deleted Milk",
      variant: "default",
      action: { label: "Undo", ariaLabel: "Undo deleting Milk", onClick() {} },
    });

    expect(markup).toMatch(/^<div[^>]*>/);
    expect(markup).toContain("<span");
    expect(markup).toContain("Deleted Milk");
    expect(markup).toMatch(/<button[^>]*aria-label="Undo deleting Milk"[^>]*>Undo<\/button>/);
  });
});
