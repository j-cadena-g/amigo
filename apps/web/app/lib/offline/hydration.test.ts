import { describe, expect, it } from "vitest";
import {
  overlayPendingMutations,
  selectMutationsToOverlay,
} from "./hydration";
import type { OfflineGroceryItem, SyncQueueEntry } from "./db";

const ctx = { householdId: "hh1", userId: "u1", now: 1_700_000_000_100 };

let nextSequence = 1;

function entry(
  partial: Partial<SyncQueueEntry> & Pick<SyncQueueEntry, "operation" | "entityId">
): SyncQueueEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: ctx.now,
    sequence: nextSequence++,
    entityType: "groceryItem",
    payload: {},
    retryCount: 0,
    lastError: null,
    ...partial,
  };
}

function item(partial: Partial<OfflineGroceryItem> & { id: string }): OfflineGroceryItem {
  return {
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

  it("replays equal-timestamp mutations in sequence order", () => {
    // Intentionally unordered: delete has higher sequence than add.
    const result = overlayPendingMutations(
      [],
      [
        entry({
          operation: "delete",
          entityId: "temp-1",
          timestamp: ctx.now,
          sequence: 2,
        }),
        entry({
          operation: "add",
          entityId: "temp-1",
          payload: { name: "Rice", tagIds: [] },
          timestamp: ctx.now,
          sequence: 1,
        }),
      ],
      ctx
    );
    expect(result).toEqual([]);
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

describe("selectMutationsToOverlay", () => {
  it("skips persisted pending mutations while replaying legacy synced rows", () => {
    const mutations = [
      entry({ operation: "toggle", entityId: "persisted-pending" }),
      entry({ operation: "toggle", entityId: "legacy-synced" }),
    ];
    const rows = [
      item({
        id: "persisted-pending",
        isPurchased: true,
        _syncStatus: "pending",
      }),
      item({
        id: "legacy-synced",
        isPurchased: false,
        _syncStatus: "synced",
      }),
    ];

    const selected = selectMutationsToOverlay(rows, mutations);
    const result = overlayPendingMutations(rows, selected, ctx);

    expect(selected.map((mutation) => mutation.entityId)).toEqual(["legacy-synced"]);
    expect(result.find((value) => value.id === "persisted-pending")?.isPurchased).toBe(true);
    expect(result.find((value) => value.id === "legacy-synced")?.isPurchased).toBe(true);
  });

  it("retains groceryTag mutations for overlay selection", () => {
    const mutations = [
      entry({
        operation: "add",
        entityId: "tag-1",
        entityType: "groceryTag",
        payload: { name: "Produce" },
      }),
      entry({ operation: "toggle", entityId: "legacy-synced" }),
    ];
    const rows = [
      item({
        id: "legacy-synced",
        isPurchased: false,
        _syncStatus: "synced",
      }),
    ];

    const selected = selectMutationsToOverlay(rows, mutations);
    expect(selected.map((m) => m.entityId)).toEqual(["tag-1", "legacy-synced"]);

    // overlayPendingMutations intentionally filters to groceryItem only.
    const result = overlayPendingMutations(rows, selected, ctx);
    expect(result).toHaveLength(1);
    expect(result[0]?.isPurchased).toBe(true);
  });
});
