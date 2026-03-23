import { describe, expect, it } from "vitest";
import type { GroceryItemWithTags, OptimisticAction } from "./types";
import {
  applyOptimisticMutations,
  clearSettledMutations,
  createOptimisticMutation,
  markMutationSettled,
} from "./optimistic-state";

function createItem(
  overrides: Partial<GroceryItemWithTags> & Pick<GroceryItemWithTags, "id" | "itemName">
): GroceryItemWithTags {
  const now = new Date("2026-03-22T12:00:00.000Z");
  const { id, itemName, ...rest } = overrides;

  return {
    id,
    itemName,
    isPurchased: false,
    purchasedAt: null,
    householdId: "household-1",
    createdByUserId: "user-1",
    createdByUserDisplayName: "Jaime",
    transferredFromCreatedByUserId: null,
    category: "General",
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    groceryItemTags: [],
    createdByUser: null,
    ...rest,
  };
}

describe("optimistic grocery mutations", () => {
  it("keeps a settled toggle optimistic until fresh loader data arrives", () => {
    const baseItems = [createItem({ id: "milk", itemName: "Milk" })];
    const toggleAction: OptimisticAction = { type: "toggle", id: "milk" };

    const pendingMutation = createOptimisticMutation(toggleAction);
    const optimisticItems = applyOptimisticMutations(baseItems, [pendingMutation]);

    expect(optimisticItems[0]?.isPurchased).toBe(true);

    const settledMutation = markMutationSettled([pendingMutation], pendingMutation.id);
    const stillOptimisticItems = applyOptimisticMutations(baseItems, settledMutation);

    expect(stillOptimisticItems[0]?.isPurchased).toBe(true);
  });

  it("drops settled mutations when loader data refreshes", () => {
    const refreshedItems = [
      createItem({
        id: "milk",
        itemName: "Milk",
        isPurchased: true,
        purchasedAt: new Date("2026-03-22T12:05:00.000Z"),
      }),
    ];
    const pendingMutation = createOptimisticMutation({ type: "toggle", id: "milk" });
    const settledMutations = markMutationSettled([pendingMutation], pendingMutation.id);

    const remainingMutations = clearSettledMutations(settledMutations);

    expect(remainingMutations).toEqual([]);
    expect(applyOptimisticMutations(refreshedItems, remainingMutations)[0]?.isPurchased).toBe(
      true
    );
  });

  it("reverts a failed toggle once stale loader data replaces the optimistic queue", () => {
    const baseItems = [createItem({ id: "milk", itemName: "Milk" })];
    const pendingMutation = createOptimisticMutation({ type: "toggle", id: "milk" });
    const settledMutations = markMutationSettled([pendingMutation], pendingMutation.id);

    const revertedItems = applyOptimisticMutations(
      baseItems,
      clearSettledMutations(settledMutations)
    );

    expect(revertedItems[0]?.isPurchased).toBe(false);
  });
});
