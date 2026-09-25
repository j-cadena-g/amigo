import { describe, expect, it } from "vitest";
import { groupGroceriesByAisle } from "./grocery-categories";

describe("groupGroceriesByAisle", () => {
  it("orders aisles the way a store is walked and keeps item order inside a group", () => {
    const groups = groupGroceriesByAisle([
      { id: "milk", category: "Dairy & Eggs" },
      { id: "bread", category: "Bakery" },
      { id: "soap", category: "Household" },
      { id: "tortillas", category: "Bakery" },
      { id: "apple", category: "Fruits & Vegetables" },
    ]);

    expect(groups.map((group) => group.category)).toEqual([
      "Fruits & Vegetables",
      "Bakery",
      "Dairy & Eggs",
      "Household",
    ]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual([
      "bread",
      "tortillas",
    ]);
  });

  it("drops empty aisles and sends unknown or retired names to General last", () => {
    const groups = groupGroceriesByAisle([
      { id: "misc", category: "Hardware" },
      { id: "legacy", category: "Produce" },
      { id: "apple", category: "Fruits & Vegetables" },
      { id: "blank", category: null },
    ]);

    expect(groups.map((group) => group.category)).toEqual([
      "Fruits & Vegetables",
      "General",
    ]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual([
      "misc",
      "legacy",
      "blank",
    ]);
  });
});
