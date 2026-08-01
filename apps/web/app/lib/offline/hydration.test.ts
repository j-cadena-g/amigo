import { describe, expect, it } from "vitest";
import { overlayPendingMutations } from "./hydration";
import type { OfflineGroceryItem, SyncQueueEntry } from "./db";

const ctx = { householdId: "hh1", userId: "u1", now: 1_700_000_000_100 };

function entry(
  partial: Partial<SyncQueueEntry> & Pick<SyncQueueEntry, "operation" | "entityId">
): SyncQueueEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: ctx.now,
    entityType: "groceryItem",
    payload: {},
    retryCount: 0,
    lastError: null,
    ...partial,
  };
}

describe("overlayPendingMutations", () => {
  it("replays queued add onto an empty cache", () => {
    const result = overlayPendingMutations(
      [],
      [entry({ operation: "add", entityId: "temp-1", payload: { name: "Rice", tagIds: [] } })],
      ctx
    );
    expect(result.map((i) => i.itemName)).toEqual(["Rice"]);
  });

  it("hides soft-deleted items after overlay", () => {
    const existing: OfflineGroceryItem[] = [
      {
        id: "g1",
        householdId: "hh1",
        createdByUserId: "u1",
        createdByUserDisplayName: null,
        itemName: "Milk",
        category: null,
        isPurchased: false,
        purchasedAt: null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        deletedAt: null,
        tagIds: [],
        _localVersion: 0,
        _serverVersion: 10,
        _syncStatus: "synced",
      },
    ];
    const result = overlayPendingMutations(
      existing,
      [entry({ operation: "delete", entityId: "g1" })],
      ctx
    );
    expect(result).toEqual([]);
  });
});
