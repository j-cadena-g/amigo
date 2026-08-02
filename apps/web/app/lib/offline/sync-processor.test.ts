import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cascadeExpiredAddDependents,
  mergeServerItemWithLocal,
  partitionViableMutations,
  processSyncQueue,
  remapEntityIdInMutations,
  takeNextSyncBatch,
} from "./sync-processor";
import type { OfflineGroceryItem, SyncQueueEntry } from "./db";
import { getOfflineDB } from "./db";

vi.mock("./sync-queue", () => ({
  getPendingMutations: vi.fn(),
  removeMutation: vi.fn(),
  markMutationFailed: vi.fn(),
  setLastSyncTimestamp: vi.fn(),
}));

vi.mock("./db", () => ({
  getOfflineDB: vi.fn(() => {
    throw new Error("IndexedDB should not be touched in these unit tests");
  }),
}));

import {
  getPendingMutations,
  markMutationFailed,
  removeMutation,
  setLastSyncTimestamp,
} from "./sync-queue";

const getPendingMutationsMock = vi.mocked(getPendingMutations);
const removeMutationMock = vi.mocked(removeMutation);
const markMutationFailedMock = vi.mocked(markMutationFailed);
const setLastSyncTimestampMock = vi.mocked(setLastSyncTimestamp);
const getOfflineDBMock = vi.mocked(getOfflineDB);

function stubOfflineDb(overrides?: {
  get?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  put?: ReturnType<typeof vi.fn>;
}) {
  const groceryItems = {
    get: overrides?.get ?? vi.fn().mockResolvedValue(null),
    delete: overrides?.delete ?? vi.fn(),
    update: overrides?.update ?? vi.fn(),
    put: overrides?.put ?? vi.fn(),
  };
  const syncQueue = {
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([]),
      })),
    })),
    update: vi.fn(),
  };
  getOfflineDBMock.mockReturnValue({
    groceryItems,
    syncQueue,
    transaction: vi.fn(async (_mode, _t1, _t2, fn) => fn()),
  } as never);
  return groceryItems;
}

function entry(
  partial: Partial<SyncQueueEntry> &
    Pick<SyncQueueEntry, "id" | "operation" | "entityId" | "retryCount">
): SyncQueueEntry {
  return {
    timestamp: 1_700_000_000_000,
    sequence: 1,
    entityType: "groceryItem",
    payload: {},
    lastError: null,
    ...partial,
  };
}

describe("partitionViableMutations", () => {
  it("separates expired retries", () => {
    const { viable, expired } = partitionViableMutations([
      { retryCount: 0 },
      { retryCount: 5 },
      { retryCount: 4 },
      { retryCount: 6 },
    ]);
    expect(viable.map((m) => m.retryCount)).toEqual([0, 4]);
    expect(expired.map((m) => m.retryCount)).toEqual([5, 6]);
  });
});

describe("cascadeExpiredAddDependents", () => {
  it("discards dependents of an expired offline add", () => {
    const expired = [
      entry({
        id: "add-1",
        operation: "add",
        entityId: "temp-1",
        retryCount: 5,
      }),
    ];
    const viable = [
      entry({
        id: "toggle-1",
        operation: "toggle",
        entityId: "temp-1",
        retryCount: 0,
      }),
      entry({
        id: "other",
        operation: "toggle",
        entityId: "g2",
        retryCount: 0,
      }),
    ];

    const result = cascadeExpiredAddDependents(viable, expired);
    expect(result.viable.map((m) => m.id)).toEqual(["other"]);
    expect(result.expired.map((m) => m.id).sort()).toEqual(["add-1", "toggle-1"]);
  });
});

describe("remapEntityIdInMutations", () => {
  it("rewrites matching entity ids for later mutations", () => {
    const mutations = [
      entry({
        id: "t1",
        operation: "toggle",
        entityId: "temp-1",
        retryCount: 0,
      }),
      entry({
        id: "t2",
        operation: "toggle",
        entityId: "g2",
        retryCount: 0,
      }),
    ];
    const remapped = remapEntityIdInMutations(mutations, "temp-1", "server-1");
    expect(remapped.map((m) => m.entityId)).toEqual(["server-1", "g2"]);
  });
});

describe("mergeServerItemWithLocal", () => {
  it("preserves temp tagIds when server payload omits them", () => {
    const temp: OfflineGroceryItem = {
      id: "temp-1",
      householdId: "hh1",
      createdByUserId: "u1",
      createdByUserDisplayName: null,
      itemName: "Milk",
      category: null,
      isPurchased: false,
      purchasedAt: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      tagIds: ["tag-a", "tag-b"],
      _localVersion: 1,
      _serverVersion: 0,
      _syncStatus: "pending",
    };

    const merged = mergeServerItemWithLocal(
      "server-1",
      {
        id: "server-1",
        householdId: "hh1",
        itemName: "Milk",
        createdAt: 2,
        updatedAt: 2,
      },
      temp,
      3
    );

    expect(merged.id).toBe("server-1");
    expect(merged.tagIds).toEqual(["tag-a", "tag-b"]);
    expect(merged._syncStatus).toBe("synced");
  });
});

describe("takeNextSyncBatch", () => {
  it("closes the batch after a grocery add so dependents are not co-submitted", () => {
    const remaining = [
      entry({
        id: "add-1",
        operation: "add",
        entityId: "temp-1",
        retryCount: 0,
        payload: { name: "Milk" },
      }),
      entry({
        id: "toggle-1",
        operation: "toggle",
        entityId: "temp-1",
        retryCount: 0,
      }),
      entry({
        id: "other",
        operation: "toggle",
        entityId: "g2",
        retryCount: 0,
      }),
    ];

    const batch = takeNextSyncBatch(remaining, 10);
    expect(batch.map((m) => m.id)).toEqual(["add-1"]);
  });
});

describe("processSyncQueue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("returns zeros for an empty queue", async () => {
    getPendingMutationsMock.mockResolvedValue([]);
    await expect(processSyncQueue()).resolves.toEqual({
      processed: 0,
      failed: 0,
      discarded: 0,
    });
  });

  it("discards expired mutations and cascades dependents", async () => {
    const groceryItems = stubOfflineDb({
      get: vi
        .fn()
        .mockResolvedValueOnce({
          id: "temp-1",
          _syncStatus: "pending",
          _serverVersion: 0,
        })
        .mockResolvedValueOnce(null),
    });
    getPendingMutationsMock.mockResolvedValue([
      entry({
        id: "add-1",
        operation: "add",
        entityId: "temp-1",
        retryCount: 5,
        payload: { name: "Milk" },
      }),
      entry({
        id: "toggle-1",
        operation: "toggle",
        entityId: "temp-1",
        retryCount: 0,
      }),
    ]);

    const result = await processSyncQueue();
    expect(result).toEqual({ processed: 0, failed: 0, discarded: 2 });
    expect(removeMutationMock).toHaveBeenCalledWith("add-1");
    expect(removeMutationMock).toHaveBeenCalledWith("toggle-1");
    expect(groceryItems.delete).toHaveBeenCalledWith("temp-1");
  });

  it("marks omitted server results as failed", async () => {
    stubOfflineDb();
    getPendingMutationsMock.mockResolvedValue([
      entry({
        id: "m1",
        operation: "toggle",
        entityId: "g1",
        retryCount: 0,
      }),
      entry({
        id: "m2",
        operation: "toggle",
        entityId: "g2",
        retryCount: 0,
      }),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            processed: 1,
            failed: 0,
            results: [{ id: "m1", success: true }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const result = await processSyncQueue();
    expect(result).toEqual({ processed: 1, failed: 1, discarded: 0 });
    expect(markMutationFailedMock).toHaveBeenCalledWith(
      "m2",
      "No result returned by server"
    );
  });

  it("stops the run on HTTP 5xx instead of continuing batches", async () => {
    stubOfflineDb();
    getPendingMutationsMock.mockResolvedValue([
      entry({
        id: "m1",
        operation: "toggle",
        entityId: "g1",
        retryCount: 0,
      }),
      entry({
        id: "m2",
        operation: "toggle",
        entityId: "g2",
        retryCount: 0,
      }),
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await processSyncQueue();
    // Both toggles fit one batch; 5xx marks them failed and stops the run.
    expect(result).toEqual({ processed: 0, failed: 2, discarded: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("counts transient batch failures as failed", async () => {
    stubOfflineDb();
    getPendingMutationsMock.mockResolvedValue([
      entry({
        id: "m1",
        operation: "toggle",
        entityId: "g1",
        retryCount: 0,
      }),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    );

    const result = await processSyncQueue();
    expect(result).toEqual({ processed: 0, failed: 1, discarded: 0 });
    expect(markMutationFailedMock).toHaveBeenCalledWith(
      "m1",
      "Server returned 500"
    );
    expect(setLastSyncTimestampMock).not.toHaveBeenCalled();
  });

  it("counts successful batches as processed without serverItem", async () => {
    stubOfflineDb();
    getPendingMutationsMock.mockResolvedValue([
      entry({
        id: "m1",
        operation: "toggle",
        entityId: "g1",
        retryCount: 0,
      }),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            processed: 1,
            failed: 0,
            results: [{ id: "m1", success: true }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const result = await processSyncQueue();
    expect(result).toEqual({ processed: 1, failed: 0, discarded: 0 });
    expect(removeMutationMock).toHaveBeenCalledWith("m1");
    expect(setLastSyncTimestampMock).toHaveBeenCalled();
  });

  it("submits add before dependents and remaps entity ids between requests", async () => {
    stubOfflineDb();
    getPendingMutationsMock.mockResolvedValue([
      entry({
        id: "add-1",
        operation: "add",
        entityId: "temp-1",
        retryCount: 0,
        payload: { name: "Milk" },
      }),
      entry({
        id: "toggle-1",
        operation: "toggle",
        entityId: "temp-1",
        retryCount: 0,
      }),
    ]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            processed: 1,
            failed: 0,
            results: [
              {
                id: "add-1",
                success: true,
                serverItem: {
                  id: "server-1",
                  householdId: "hh1",
                  createdByUserId: "u1",
                  createdByUserDisplayName: null,
                  itemName: "Milk",
                  category: "General",
                  isPurchased: false,
                  purchasedAt: null,
                  createdAt: 1,
                  updatedAt: 1,
                  deletedAt: null,
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            processed: 1,
            failed: 0,
            results: [{ id: "toggle-1", success: true }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await processSyncQueue();
    expect(result).toEqual({ processed: 2, failed: 0, discarded: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string
    );
    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as RequestInit).body as string
    );
    expect(firstBody.mutations).toEqual([
      expect.objectContaining({ id: "add-1", entityId: "temp-1" }),
    ]);
    expect(secondBody.mutations).toEqual([
      expect.objectContaining({ id: "toggle-1", entityId: "server-1" }),
    ]);
  });

  it("rejects whitespace-only server ids during add remap", async () => {
    const groceryItems = stubOfflineDb({
      get: vi.fn().mockResolvedValue({
        id: "temp-1",
        householdId: "hh1",
        _syncStatus: "pending",
        _serverVersion: 0,
      }),
    });
    getPendingMutationsMock.mockResolvedValue([
      entry({
        id: "add-1",
        operation: "add",
        entityId: "temp-1",
        retryCount: 0,
      }),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            processed: 1,
            failed: 0,
            results: [
              {
                id: "add-1",
                success: true,
                serverItem: { id: "   " },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await processSyncQueue();

    expect(groceryItems.delete).not.toHaveBeenCalled();
    expect(groceryItems.put).not.toHaveBeenCalled();
    expect(removeMutationMock).not.toHaveBeenCalledWith("add-1");
    expect(markMutationFailedMock).toHaveBeenCalledWith(
      "add-1",
      "Server returned no usable item id"
    );
  });

  it("marks successful add without serverItem as failed instead of removing it", async () => {
    stubOfflineDb();
    getPendingMutationsMock.mockResolvedValue([
      entry({
        id: "add-1",
        operation: "add",
        entityId: "temp-1",
        retryCount: 0,
      }),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            processed: 1,
            failed: 0,
            results: [{ id: "add-1", success: true }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await processSyncQueue();

    expect(removeMutationMock).not.toHaveBeenCalledWith("add-1");
    expect(markMutationFailedMock).toHaveBeenCalledWith(
      "add-1",
      "Server returned no usable item id"
    );
  });

  it("preserves mixed processed and discarded counts", async () => {
    stubOfflineDb({
      get: vi.fn().mockResolvedValue({
        id: "g-old",
        _syncStatus: "pending",
        _serverVersion: 10,
      }),
    });
    getPendingMutationsMock.mockResolvedValue([
      entry({
        id: "expired",
        operation: "toggle",
        entityId: "g-old",
        retryCount: 5,
      }),
      entry({
        id: "ok",
        operation: "toggle",
        entityId: "g1",
        retryCount: 0,
      }),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            processed: 1,
            failed: 0,
            results: [{ id: "ok", success: true }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const result = await processSyncQueue();
    expect(result).toEqual({ processed: 1, failed: 0, discarded: 1 });
  });
});
