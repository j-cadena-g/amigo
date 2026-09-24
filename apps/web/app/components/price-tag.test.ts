import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatSignedCents } from "@/app/lib/currency";
import { PriceTag } from "./price-tag";

function render(props: React.ComponentProps<typeof PriceTag>) {
  return renderToStaticMarkup(React.createElement(PriceTag, props));
}

describe("PriceTag", () => {
  it("gives screen readers the full amount and hides the split pieces", () => {
    const html = render({ cents: 234056, currency: "CAD" });

    expect(html).toContain(
      `<span class="sr-only">${formatSignedCents(234056, "CAD")}</span>`
    );
    expect(html).toMatch(/aria-hidden="true"[^>]*>.*>\$<.*>2,340<.*>56</);
  });

  it("only paints the yellow tag for the tag variant", () => {
    expect(render({ cents: 100, currency: "CAD", variant: "tag" })).toContain("bg-tag");
    expect(render({ cents: 100, currency: "CAD" })).not.toContain("bg-tag");
  });

  it("puts a true minus in front of negative amounts", () => {
    const html = render({ cents: -2746958, currency: "CAD", size: "large" });

    expect(html).toContain(formatSignedCents(-2746958, "CAD"));
    expect(html).toMatch(/aria-hidden="true"[^>]*>.*>−<.*>\$<.*>27,469</);
  });
});
