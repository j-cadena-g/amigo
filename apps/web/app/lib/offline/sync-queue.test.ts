import { describe, expect, it } from "vitest";
import { comparePendingMutations } from "./sync-queue";
import type { SyncQueueEntry } from "./db";

function entry(
  partial: Partial<SyncQueueEntry> &
    Pick<SyncQueueEntry, "operation" | "entityId">
): SyncQueueEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: 1_700_000_000_000,
    sequence: 1,
    entityType: "groceryItem",
    payload: {},
    retryCount: 0,
    lastError: null,
    ...partial,
  };
}

describe("comparePendingMutations", () => {
  it("orders add before toggle on the same entity even when toggle is earlier", () => {
    const toggle = entry({
      operation: "toggle",
      entityId: "temp-1",
      timestamp: 100,
      sequence: 1,
    });
    const add = entry({
      operation: "add",
      entityId: "temp-1",
      timestamp: 200,
      sequence: 2,
    });

    expect([toggle, add].sort(comparePendingMutations)).toEqual([add, toggle]);
  });

  it("falls back to timestamp and sequence for unrelated entities", () => {
    const first = entry({
      operation: "toggle",
      entityId: "a",
      timestamp: 100,
      sequence: 1,
    });
    const second = entry({
      operation: "toggle",
      entityId: "b",
      timestamp: 200,
      sequence: 1,
    });

    expect([second, first].sort(comparePendingMutations)).toEqual([
      first,
      second,
    ]);
  });
});
