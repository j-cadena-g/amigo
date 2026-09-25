import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkOffDelayMs,
  prefersReducedMotion,
  STRIKE_THROUGH_MS,
} from "./check-off";

describe("checkOffDelayMs", () => {
  it("lets the strike-through finish before the item moves", () => {
    expect(checkOffDelayMs(false)).toBeGreaterThan(STRIKE_THROUGH_MS);
  });

  it("moves the item immediately under reduced motion", () => {
    expect(checkOffDelayMs(true)).toBe(0);
  });
});

describe("prefersReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false without a window (server render)", () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reads the reduced-motion media query", () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
    }));
    vi.stubGlobal("window", { matchMedia });

    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("is false when the user has not asked for reduced motion", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });

    expect(prefersReducedMotion()).toBe(false);
  });
});
