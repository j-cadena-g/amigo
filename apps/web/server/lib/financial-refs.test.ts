import { describe, expect, it } from "vitest";
import { refsChangedFromExisting } from "./financial-refs";

describe("refsChangedFromExisting", () => {
  it("ignores an unchanged budget so stale links can stay on amount edits", () => {
    expect(
      refsChangedFromExisting(
        { budgetId: "budget-1", accountId: null },
        { budgetId: "budget-1", accountId: null }
      )
    ).toEqual({});
  });

  it("validates a newly chosen budget", () => {
    expect(
      refsChangedFromExisting(
        { budgetId: "budget-2" },
        { budgetId: "budget-1", accountId: null }
      )
    ).toEqual({ budgetId: "budget-2" });
  });

  it("validates clearing a budget", () => {
    expect(
      refsChangedFromExisting(
        { budgetId: null },
        { budgetId: "budget-1", accountId: null }
      )
    ).toEqual({ budgetId: null });
  });
});
