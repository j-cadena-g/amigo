import { describe, expect, it } from "vitest";
import { sortPendingMutations } from "./sync-queue";
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

describe("sortPendingMutations", () => {
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

    const sorted = sortPendingMutations([toggle, add]);
    expect(sorted.indexOf(add)).toBeLessThan(sorted.indexOf(toggle));
  });

  it("submits add before an earlier dependent when an unrelated mutation sits between", () => {
    const toggle = entry({
      id: "toggle-temp-1",
      operation: "toggle",
      entityId: "temp-1",
      timestamp: 100,
      sequence: 1,
    });
    const unrelated = entry({
      id: "toggle-other",
      operation: "toggle",
      entityId: "temp-2",
      timestamp: 150,
      sequence: 2,
    });
    const add = entry({
      id: "add-temp-1",
      operation: "add",
      entityId: "temp-1",
      timestamp: 200,
      sequence: 3,
    });

    const sorted = sortPendingMutations([toggle, unrelated, add]);

    expect(sorted.indexOf(add)).toBeLessThan(sorted.indexOf(toggle));
    expect(sorted.indexOf(unrelated)).toBeLessThan(sorted.indexOf(toggle));
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

    expect(sortPendingMutations([second, first])).toEqual([first, second]);
  });
});
