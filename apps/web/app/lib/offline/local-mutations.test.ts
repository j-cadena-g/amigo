import { describe, expect, it } from "vitest";
import {
  applyQueuedMutationToItems,
  buildOfflineItemForAdd,
} from "./local-mutations";
import type { OfflineGroceryItem } from "./db";

const ctx = { householdId: "hh1", userId: "u1", now: 1_700_000_000_000 };

function item(partial: Partial<OfflineGroceryItem> & { id: string }): OfflineGroceryItem {
  return {
    householdId: "hh1",
    createdByUserId: "u1",
    createdByUserDisplayName: "Ada",
    itemName: "Milk",
    category: null,
    isPurchased: false,
    purchasedAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
    tagIds: [],
    _localVersion: 0,
    _serverVersion: 0,
    _syncStatus: "pending",
    ...partial,
  };
}

describe("applyQueuedMutationToItems", () => {
  it("adds a new pending item", () => {
    const next = applyQueuedMutationToItems(
      [],
      {
        operation: "add",
        entityId: "temp-1",
        payload: { name: "Eggs", tagIds: ["t1"] },
      },
      ctx
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: "temp-1",
      itemName: "Eggs",
      tagIds: ["t1"],
      _syncStatus: "pending",
      deletedAt: null,
    });
  });

  it("toggles purchase state", () => {
    const next = applyQueuedMutationToItems(
      [item({ id: "g1", isPurchased: false })],
      { operation: "toggle", entityId: "g1", payload: {} },
      ctx
    );
    expect(next[0]?.isPurchased).toBe(true);
    expect(next[0]?._syncStatus).toBe("pending");
  });

  it("soft-deletes an item", () => {
    const next = applyQueuedMutationToItems(
      [item({ id: "g1" })],
      { operation: "delete", entityId: "g1", payload: {} },
      ctx
    );
    expect(next[0]?.deletedAt).toBe(ctx.now);
    expect(next[0]?._syncStatus).toBe("pending");
  });

  it("updates tag ids", () => {
    const next = applyQueuedMutationToItems(
      [item({ id: "g1", tagIds: ["a"] })],
      { operation: "updateTags", entityId: "g1", payload: { tagIds: ["b", "c"] } },
      ctx
    );
    expect(next[0]?.tagIds).toEqual(["b", "c"]);
  });

  it("is a no-op for unknown entity on non-add ops", () => {
    const base = [item({ id: "g1" })];
    const next = applyQueuedMutationToItems(
      base,
      { operation: "toggle", entityId: "missing", payload: {} },
      ctx
    );
    expect(next).toEqual(base);
  });
});

describe("buildOfflineItemForAdd", () => {
  it("builds a pending offline row", () => {
    const row = buildOfflineItemForAdd(ctx, "temp-1", {
      name: "Bread",
      tagIds: [],
    });
    expect(row.itemName).toBe("Bread");
    expect(row._serverVersion).toBe(0);
    expect(row._syncStatus).toBe("pending");
  });
});
