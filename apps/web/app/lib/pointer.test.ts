import { afterEach, describe, expect, it, vi } from "vitest";
import { focusDialogNotField, hasFinePointer } from "./pointer";

describe("hasFinePointer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false without a window (server render)", () => {
    expect(hasFinePointer()).toBe(false);
  });

  it("is false when matchMedia is unavailable", () => {
    vi.stubGlobal("window", {});

    expect(hasFinePointer()).toBe(false);
  });

  it("is true for a mouse or trackpad", () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query === "(pointer: fine)",
    }));
    vi.stubGlobal("window", { matchMedia });

    expect(hasFinePointer()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(pointer: fine)");
  });

  it("is false on a touch screen", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });

    expect(hasFinePointer()).toBe(false);
  });
});

describe("focusDialogNotField", () => {
  /** Dispatches an open auto-focus event on a stand-in dialog, as Radix does. */
  function openDialog(finePointer: boolean, preventedByCaller = false) {
    const dialog = Object.assign(new EventTarget(), { focus: vi.fn() });
    const event = new Event("focusScope.autoFocusOnMount", { cancelable: true });
    if (preventedByCaller) dialog.addEventListener(event.type, (e) => e.preventDefault());
    dialog.addEventListener(event.type, (e) => focusDialogNotField(e, finePointer));
    dialog.dispatchEvent(event);
    return { dialog, event };
  }

  it("focuses the dialog, not its first field, on a touch screen", () => {
    const { dialog, event } = openDialog(false);

    expect(event.defaultPrevented).toBe(true);
    expect(dialog.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("leaves the first field focused with a mouse or trackpad", () => {
    const { dialog, event } = openDialog(true);

    expect(event.defaultPrevented).toBe(false);
    expect(dialog.focus).not.toHaveBeenCalled();
  });

  it("leaves focus alone when the dialog already handled it", () => {
    const { dialog } = openDialog(false, true);

    expect(dialog.focus).not.toHaveBeenCalled();
  });
});
