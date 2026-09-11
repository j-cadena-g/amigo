import { describe, expect, it } from "vitest";
import { getRovingRadioTargetIndex } from "./use-roving-radio-group";

describe("getRovingRadioTargetIndex", () => {
  it("moves to the next option on ArrowRight/ArrowDown", () => {
    expect(getRovingRadioTargetIndex(0, "ArrowRight", 3)).toBe(1);
    expect(getRovingRadioTargetIndex(1, "ArrowDown", 3)).toBe(2);
  });

  it("moves to the previous option on ArrowLeft/ArrowUp", () => {
    expect(getRovingRadioTargetIndex(2, "ArrowLeft", 3)).toBe(1);
    expect(getRovingRadioTargetIndex(1, "ArrowUp", 3)).toBe(0);
  });

  it("wraps around at both ends", () => {
    expect(getRovingRadioTargetIndex(2, "ArrowRight", 3)).toBe(0);
    expect(getRovingRadioTargetIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(getRovingRadioTargetIndex(2, "ArrowDown", 3)).toBe(0);
    expect(getRovingRadioTargetIndex(0, "ArrowUp", 3)).toBe(2);
  });

  it("jumps to first/last on Home/End", () => {
    expect(getRovingRadioTargetIndex(1, "Home", 3)).toBe(0);
    expect(getRovingRadioTargetIndex(0, "End", 3)).toBe(2);
  });

  it("handles a two-option group", () => {
    expect(getRovingRadioTargetIndex(0, "ArrowRight", 2)).toBe(1);
    expect(getRovingRadioTargetIndex(1, "ArrowRight", 2)).toBe(0);
    expect(getRovingRadioTargetIndex(0, "ArrowLeft", 2)).toBe(1);
  });

  it("ignores unrelated keys", () => {
    expect(getRovingRadioTargetIndex(0, "Tab", 3)).toBeNull();
    expect(getRovingRadioTargetIndex(0, "Enter", 3)).toBeNull();
    expect(getRovingRadioTargetIndex(0, " ", 3)).toBeNull();
  });

  it("returns null for out-of-range input", () => {
    expect(getRovingRadioTargetIndex(0, "ArrowRight", 0)).toBeNull();
    expect(getRovingRadioTargetIndex(-1, "ArrowRight", 3)).toBeNull();
    expect(getRovingRadioTargetIndex(3, "ArrowRight", 3)).toBeNull();
  });
});
