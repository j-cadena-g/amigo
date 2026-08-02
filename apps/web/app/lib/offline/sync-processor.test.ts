import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cascadeExpiredAddDependents,
  partitionViableMutations,
  processSyncQueue,
  remapEntityIdInMutations,
} from "./sync-processor";
import type { SyncQueueEntry } from "./db";

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

describe("processSyncQueue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
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
  });

  it("counts transient batch failures as failed", async () => {
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

  it("preserves mixed processed and discarded counts", async () => {
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
