import { describe, expect, it } from "vitest";
import { formatRelativeDate } from "./format-dates";

describe("formatRelativeDate", () => {
  it("labels dates relative to household today", () => {
    expect(formatRelativeDate("2026-06-16", "2026-06-16")).toBe("Today");
    expect(formatRelativeDate("2026-06-15", "2026-06-16")).toBe("Yesterday");
    expect(formatRelativeDate("2026-06-17", "2026-06-16")).toBe("Tomorrow");
    expect(formatRelativeDate("2026-06-10", "2026-06-16")).toBe("6d ago");
  });

  it("falls back to short absolute dates outside the relative window", () => {
    expect(formatRelativeDate("2026-05-11", "2026-06-16")).toBe("May 11");
  });
});
