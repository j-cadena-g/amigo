import { describe, expect, it } from "vitest";
import {
  applyMerchantAlias,
  lessonForMerchant,
  type MerchantLessonRow,
} from "./merchant-aliases";

const row = (overrides: Partial<MerchantLessonRow> = {}): MerchantLessonRow => ({
  suggestedName: "Wal-Mart",
  chosenName: "Wal-Mart",
  suggestedCategoryId: null,
  chosenCategoryId: null,
  ...overrides,
});

describe("lessonForMerchant", () => {
  it("learns a name the user changed", () => {
    expect(lessonForMerchant([row({ chosenName: "My Walmart" })])).toEqual({
      displayName: "My Walmart",
    });
  });

  it("learns a category the user changed", () => {
    expect(
      lessonForMerchant([row({ chosenCategoryId: "cat-groceries" })])
    ).toEqual({ categoryId: "cat-groceries" });
  });

  it("returns null when nothing changed", () => {
    expect(
      lessonForMerchant([
        row({ suggestedCategoryId: "cat-groceries", chosenCategoryId: "cat-groceries" }),
      ])
    ).toBeNull();
  });

  it("learns the value chosen on the most rows", () => {
    expect(
      lessonForMerchant([
        row({ chosenName: "Neighbourhood", chosenCategoryId: "cat-groceries" }),
        row({ chosenName: "Superstore", chosenCategoryId: "cat-dining" }),
        row({ chosenName: "Neighbourhood", chosenCategoryId: "cat-groceries" }),
      ])
    ).toEqual({ displayName: "Neighbourhood", categoryId: "cat-groceries" });
  });

  it("breaks a tie with the last row", () => {
    expect(
      lessonForMerchant([
        row({ chosenName: "Alpha", chosenCategoryId: "cat-a" }),
        row({ chosenName: "Beta", chosenCategoryId: "cat-b" }),
      ])
    ).toEqual({ displayName: "Beta", categoryId: "cat-b" });
  });

  it("does not learn a null chosen category", () => {
    expect(
      lessonForMerchant([
        row({ suggestedCategoryId: "cat-groceries", chosenCategoryId: null }),
      ])
    ).toBeNull();
    expect(
      lessonForMerchant([
        row({
          chosenName: "My Walmart",
          suggestedCategoryId: "cat-groceries",
          chosenCategoryId: null,
        }),
      ])
    ).toEqual({ displayName: "My Walmart" });
  });
});

describe("applyMerchantAlias", () => {
  const alias = {
    displayName: "My Walmart",
    categoryId: "cat-groceries",
    source: "user" as const,
  };

  it("applies the alias name and category", () => {
    expect(
      applyMerchantAlias({
        cleanedName: "Wal-Mart",
        merchantKey: "WAL-MART",
        rowType: "expense",
        alias,
        category: { type: "expense", name: "Groceries" },
      })
    ).toEqual({
      merchantKey: "WAL-MART",
      description: "My Walmart",
      categoryId: "cat-groceries",
      categoryName: "Groceries",
      categorySource: "user",
      nameSource: "user",
    });
  });

  it("drops a category whose type does not match the row", () => {
    expect(
      applyMerchantAlias({
        cleanedName: "Wal-Mart",
        merchantKey: "WAL-MART",
        rowType: "expense",
        alias,
        category: { type: "income", name: "Paycheck" },
      })
    ).toEqual({
      merchantKey: "WAL-MART",
      description: "My Walmart",
      categoryId: null,
      categoryName: null,
      categorySource: "none",
      nameSource: "user",
    });
  });

  it('reports "none" when there is no alias', () => {
    expect(
      applyMerchantAlias({
        cleanedName: "Wal-Mart",
        merchantKey: "WAL-MART",
        rowType: "expense",
      })
    ).toEqual({
      merchantKey: "WAL-MART",
      description: "Wal-Mart",
      categoryId: null,
      categoryName: null,
      categorySource: "none",
      nameSource: "none",
    });
  });
});
