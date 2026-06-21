import { describe, expect, it } from "vitest";
import { groupCategoriesForSelect } from "./use-financial-categories";
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

describe("groupCategoriesForSelect", () => {
  it("includes a parent as the first option when it has subcategories", () => {
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

    const groups = groupCategoriesForSelect([parent, child], "expense");

    expect(groups).toEqual([
      {
        label: "Subscriptions",
        options: [parent, child],
      },
    ]);
  });

  it("lists leaf parents without an optgroup label", () => {
    const parent = category({ id: "parent-1", name: "Groceries" });

    const groups = groupCategoriesForSelect([parent], "expense");

    expect(groups).toEqual([{ label: null, options: [parent] }]);
  });
});
