import { describe, expect, it } from "vitest";
import { groupGroceriesByAisle } from "./grocery-categories";

describe("groupGroceriesByAisle", () => {
  it("orders aisles from the allowlist and keeps item order inside a group", () => {
    const groups = groupGroceriesByAisle([
      { id: "bread", category: "Bakery" },
      { id: "milk", category: "Dairy" },
      { id: "tortillas", category: "Bakery" },
      { id: "soap", category: "Household" },
    ]);

    expect(groups.map((group) => group.category)).toEqual([
      "Dairy",
      "Bakery",
      "Household",
    ]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual([
      "bread",
      "tortillas",
    ]);
  });

  it("drops empty aisles and sends unknown categories to General last", () => {
    const groups = groupGroceriesByAisle([
      { id: "misc", category: "Deli" },
      { id: "apple", category: "Produce" },
      { id: "blank", category: null },
    ]);

    expect(groups.map((group) => group.category)).toEqual([
      "Produce",
      "General",
    ]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(["misc", "blank"]);
  });
});