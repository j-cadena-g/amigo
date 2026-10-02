import { describe, expect, it } from "vitest";
import { editedDescriptions } from "./import-descriptions";

const rows = [
  { externalId: "a", description: "POS 1234 CAFE" },
  { externalId: "b", description: null },
];

describe("editedDescriptions", () => {
  it("ignores an edit that matches the preview description", () => {
    expect(
      editedDescriptions(rows, new Map([["a", "  POS 1234 CAFE  "]]), new Set())
    ).toEqual({});
  });

  it("ignores a whitespace-only edit", () => {
    expect(editedDescriptions(rows, new Map([["a", "   "]]), new Set())).toEqual({});
  });

  it("sends the trimmed edit when it differs from the preview description", () => {
    expect(
      editedDescriptions(rows, new Map([["a", "  Cafe  "]]), new Set())
    ).toEqual({ a: "Cafe" });
  });

  it("ignores an excluded row", () => {
    expect(
      editedDescriptions(
        rows,
        new Map([
          ["a", "Cafe"],
          ["b", "Market"],
        ]),
        new Set(["a"])
      )
    ).toEqual({ b: "Market" });
  });

  it("ignores an edit longer than 200 characters", () => {
    const limit = "a".repeat(200);
    expect(
      editedDescriptions(
        rows,
        new Map([
          ["a", ` ${"b".repeat(201)} `],
          ["b", ` ${limit} `],
        ]),
        new Set()
      )
    ).toEqual({ b: limit });
  });

  it("sends an edit when the preview description is null", () => {
    expect(editedDescriptions(rows, new Map([["b", "Cafe"]]), new Set())).toEqual({
      b: "Cafe",
    });
  });
});
