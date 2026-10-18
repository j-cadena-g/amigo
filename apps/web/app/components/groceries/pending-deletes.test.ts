import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPendingDeletes, UNDO_DELETE_MS } from "./pending-deletes";

function setup() {
  const commit = vi.fn<(id: string) => void>();
  const changes: string[][] = [];
  const pending = createPendingDeletes({
    commit,
    onChange: (ids) => changes.push([...ids]),
  });
  const hidden = () => changes.at(-1) ?? [];
  return { pending, commit, hidden };
}

describe("createPendingDeletes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides the item right away and sends the delete when the undo window ends", () => {
    const { pending, commit, hidden } = setup();

    pending.schedule("milk");
    expect(hidden()).toEqual(["milk"]);
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(UNDO_DELETE_MS - 1);
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledExactlyOnceWith("milk");
    expect(hidden()).toEqual([]);
  });

  it("never sends an undone delete and shows the item again", () => {
    const { pending, commit, hidden } = setup();

    pending.schedule("milk");
    expect(pending.undo("milk")).toBe(true);
    expect(hidden()).toEqual([]);

    vi.advanceTimersByTime(UNDO_DELETE_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it("can't undo once the delete went out", () => {
    const { pending, commit } = setup();

    pending.schedule("milk");
    vi.advanceTimersByTime(UNDO_DELETE_MS);

    expect(pending.undo("milk")).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("keeps separate windows for separate items", () => {
    const { pending, commit, hidden } = setup();

    pending.schedule("milk");
    vi.advanceTimersByTime(2000);
    pending.schedule("eggs");
    expect(hidden()).toEqual(["milk", "eggs"]);

    pending.undo("eggs");
    vi.advanceTimersByTime(UNDO_DELETE_MS);

    expect(commit).toHaveBeenCalledExactlyOnceWith("milk");
    expect(hidden()).toEqual([]);
  });

  it("ignores a second delete of an item that's already waiting", () => {
    const { pending, commit } = setup();

    pending.schedule("milk");
    vi.advanceTimersByTime(3000);
    pending.schedule("milk");
    // The first delete's window, not a restarted one.
    vi.advanceTimersByTime(UNDO_DELETE_MS - 3000);

    expect(commit).toHaveBeenCalledExactlyOnceWith("milk");
  });

  it("sends everything waiting when flushed, and nothing twice", () => {
    const { pending, commit, hidden } = setup();

    pending.schedule("milk");
    pending.schedule("eggs");
    pending.flush();

    expect(commit.mock.calls).toEqual([["milk"], ["eggs"]]);
    expect(hidden()).toEqual([]);

    vi.advanceTimersByTime(UNDO_DELETE_MS);
    pending.flush();
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("sends the delete before showing the item again, so it doesn't flash back", () => {
    const order: string[] = [];
    const pending = createPendingDeletes({
      commit: () => order.push("commit"),
      onChange: (ids) => order.push(`hidden:${[...ids].join(",")}`),
    });

    pending.schedule("milk");
    vi.advanceTimersByTime(UNDO_DELETE_MS);

    expect(order).toEqual(["hidden:milk", "commit", "hidden:"]);
  });
});
