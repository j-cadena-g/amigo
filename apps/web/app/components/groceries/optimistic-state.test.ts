import { describe, expect, it } from "vitest";
import type { GroceryItemWithTags, OptimisticAction } from "./types";
import {
  applyOptimisticAction,
  applyOptimisticMutations,
  createOptimisticMutation,
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
  it("applies a pending toggle as an overlay without mutating base items", () => {
    const baseItems = [createItem({ id: "milk", itemName: "Milk" })];
    const mutation = createOptimisticMutation({ type: "toggle", id: "milk" });

    const optimisticItems = applyOptimisticMutations(baseItems, [mutation]);

    expect(optimisticItems[0]?.isPurchased).toBe(true);
    // Base list is left untouched so a failed request can revert by dropping the overlay.
    expect(baseItems[0]?.isPurchased).toBe(false);
  });

  it("reverts a failed mutation by dropping the overlay", () => {
    const baseItems = [createItem({ id: "milk", itemName: "Milk" })];
    const mutation = createOptimisticMutation({ type: "toggle", id: "milk" });

    applyOptimisticMutations(baseItems, [mutation]);
    // Request failed -> overlay removed, base unchanged.
    const reverted = applyOptimisticMutations(baseItems, []);

    expect(reverted[0]?.isPurchased).toBe(false);
  });

  it("commits a successful toggle into the base list via applyOptimisticAction", () => {
    const baseItems = [createItem({ id: "milk", itemName: "Milk" })];
    const action: OptimisticAction = { type: "toggle", id: "milk" };

    const committed = applyOptimisticAction(baseItems, action);

    expect(committed[0]?.isPurchased).toBe(true);
    expect(committed[0]?.purchasedAt).toBeInstanceOf(Date);
  });

  it("stacks multiple overlays in order so repeated toggles net out", () => {
    const baseItems = [createItem({ id: "milk", itemName: "Milk" })];
    const first = createOptimisticMutation({ type: "toggle", id: "milk" });
    const second = createOptimisticMutation({ type: "toggle", id: "milk" });

    const optimisticItems = applyOptimisticMutations(baseItems, [first, second]);

    expect(optimisticItems[0]?.isPurchased).toBe(false);
  });

  it("commits an edit-name action", () => {
    const baseItems = [createItem({ id: "milk", itemName: "Milk" })];

    const committed = applyOptimisticAction(baseItems, {
      type: "edit_name",
      id: "milk",
      name: "Oat Milk",
    });

    expect(committed[0]?.itemName).toBe("Oat Milk");
  });

  it("commits a delete action by removing the item", () => {
    const baseItems = [
      createItem({ id: "milk", itemName: "Milk" }),
      createItem({ id: "eggs", itemName: "Eggs" }),
    ];

    const committed = applyOptimisticAction(baseItems, {
      type: "delete",
      id: "milk",
    });

    expect(committed).toHaveLength(1);
    expect(committed[0]?.id).toBe("eggs");
  });
});
