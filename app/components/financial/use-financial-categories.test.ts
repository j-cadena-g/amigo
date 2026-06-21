import { describe, expect, it } from "vitest";
import { listCategoriesForSelect } from "./use-financial-categories";
import type { FinancialCategoryItem } from "@/app/lib/financial-category-types";

function category(
  overrides: Partial<FinancialCategoryItem> & Pick<FinancialCategoryItem, "id" | "name">
): FinancialCategoryItem {
  return {
    householdId: "hh-1",
    parentId: null,
    type: "expense",
    sortOrder: 0,
    archived: false,
    icon: null,
    hasChildren: false,
    selectable: true,
    ...overrides,
  };
}

describe("listCategoriesForSelect", () => {
  it("lists the parent once with indented subcategories", () => {
    const parent = category({
      id: "parent-1",
      name: "Subscriptions",
      hasChildren: true,
    });
    const child = category({
      id: "child-1",
      name: "Streaming",
      parentId: "parent-1",
      sortOrder: 1,
    });

    expect(listCategoriesForSelect([parent, child], "expense")).toEqual([
      { category: parent, indent: false },
      { category: child, indent: true },
    ]);
  });

  it("lists leaf categories without indentation", () => {
    const parent = category({ id: "parent-1", name: "Groceries" });

    expect(listCategoriesForSelect([parent], "expense")).toEqual([
      { category: parent, indent: false },
    ]);
  });
});
