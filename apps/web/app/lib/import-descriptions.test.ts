import { describe, expect, it } from "vitest";
import {
  chosenCategories,
  editedDescriptions,
  sameMerchantTargets,
} from "./import-descriptions";

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

describe("chosenCategories", () => {
  const preview = [
    { externalId: "a", categoryId: "groceries" },
    { externalId: "b", categoryId: null },
    { externalId: "c", categoryId: "rent" },
  ];
  const editable = () => true;

  it("uses a choice instead of the suggestion", () => {
    expect(
      chosenCategories(preview, new Map([["a", "dining"]]), new Set(), editable)
    ).toEqual({ a: "dining", b: null, c: "rent" });
  });

  it("maps an empty-string choice to null", () => {
    expect(
      chosenCategories(preview, new Map([["a", ""]]), new Set(), editable)
    ).toEqual({ a: null, b: null, c: "rent" });
  });

  it("skips excluded rows", () => {
    expect(
      chosenCategories(preview, new Map([["a", "dining"]]), new Set(["b"]), editable)
    ).toEqual({ a: "dining", c: "rent" });
  });

  it("skips rows that are not editable", () => {
    expect(
      chosenCategories(preview, new Map([["c", "dining"]]), new Set(), (id) => id !== "c")
    ).toEqual({ a: "groceries", b: null });
  });

  it("keeps the suggestion when the row has no choice", () => {
    expect(chosenCategories(preview, new Map(), new Set(), editable)).toEqual({
      a: "groceries",
      b: null,
      c: "rent",
    });
  });
});

describe("sameMerchantTargets", () => {
  const preview = [
    { externalId: "a", merchantKey: "cafe", categoryId: "groceries" },
    { externalId: "b", merchantKey: "cafe", categoryId: "rent" },
    { externalId: "c", merchantKey: "cafe", categoryId: "groceries" },
    { externalId: "d", merchantKey: null, categoryId: "rent" },
    { externalId: "e", merchantKey: "market", categoryId: "rent" },
  ];
  const editable = () => true;

  it("returns none when the changed row has a null merchant key", () => {
    expect(
      sameMerchantTargets(preview, "d", "groceries", new Map(), new Set(), editable)
    ).toEqual([]);
  });

  it("excludes the changed row and rows from other merchants", () => {
    expect(
      sameMerchantTargets(preview, "a", "dining", new Map(), new Set(), editable)
    ).toEqual(["b", "c"]);
  });

  it("skips excluded rows", () => {
    expect(
      sameMerchantTargets(preview, "a", "dining", new Map(), new Set(["b"]), editable)
    ).toEqual(["c"]);
  });

  it("skips rows that are not editable", () => {
    expect(
      sameMerchantTargets(preview, "a", "dining", new Map(), new Set(), (id) => id !== "b")
    ).toEqual(["c"]);
  });

  it("skips rows already on that category", () => {
    expect(
      sameMerchantTargets(preview, "b", "groceries", new Map(), new Set(), editable)
    ).toEqual([]);
  });

  it("treats a prior choice as the row's current category", () => {
    expect(
      sameMerchantTargets(
        preview,
        "a",
        "dining",
        new Map([
          ["b", "dining"],
          ["c", "rent"],
        ]),
        new Set(),
        editable
      )
    ).toEqual(["c"]);
  });
});
