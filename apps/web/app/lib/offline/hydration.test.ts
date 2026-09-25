import { describe, expect, it, vi } from "vitest";
import {
  hydrateFromServer,
  overlayPendingMutations,
  selectMutationsToOverlay,
} from "./hydration";
import { getOfflineDB, type OfflineGroceryItem, type SyncQueueEntry } from "./db";

vi.mock("./db", () => ({ getOfflineDB: vi.fn() }));
vi.mock("./sync-queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sync-queue")>()),
  setLastSyncTimestamp: vi.fn(),
}));

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

describe("hydrateFromServer", () => {
  it("takes the server's aisle for a pending row whose server version is unchanged", async () => {
    const pending = item({
      id: "g1",
      category: "Dairy",
      isPurchased: true,
      _serverVersion: 10,
      _syncStatus: "pending",
    });
    const update = vi.fn();
    vi.mocked(getOfflineDB).mockReturnValue({
      groceryItems: {
        count: vi.fn().mockResolvedValue(1),
        get: vi.fn().mockResolvedValue(pending),
        update,
      },
      groceryTags: { get: vi.fn(), put: vi.fn() },
    } as unknown as ReturnType<typeof getOfflineDB>);

    await hydrateFromServer(
      [
        {
          id: "g1",
          householdId: "hh1",
          createdByUserId: "u1",
          createdByUserDisplayName: null,
          itemName: "Milk",
          category: "Dairy & Eggs",
          isPurchased: false,
          purchasedAt: null,
          createdAt: ctx.now,
          updatedAt: 10,
          deletedAt: null,
          tags: [],
        },
      ],
      []
    );

    expect(update).toHaveBeenCalledWith("g1", {
      category: "Dairy & Eggs",
      _serverVersion: 10,
    });
  });
});
