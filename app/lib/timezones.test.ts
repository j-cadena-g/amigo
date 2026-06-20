import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTimezoneOptions,
  COMMON_TIMEZONES,
  getBrowserTimezone,
  isSupportedTimezone,
} from "./timezones";

describe("timezones", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes the selected timezone when it is outside the common list", () => {
    expect(buildTimezoneOptions("America/Halifax")[0]).toBe("America/Halifax");
    expect(buildTimezoneOptions("America/Halifax")).toContain("UTC");
  });

  it("returns the common list when the selected timezone is already listed", () => {
    expect(buildTimezoneOptions("UTC")).toEqual([...COMMON_TIMEZONES]);
  });

  it("validates IANA timezone identifiers", () => {
    expect(isSupportedTimezone("America/Toronto")).toBe(true);
    expect(isSupportedTimezone("Not/A/Timezone")).toBe(false);
  });

  it("falls back to UTC when the browser timezone is invalid", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Invalid/Timezone",
    } as Intl.ResolvedDateTimeFormatOptions);

    expect(getBrowserTimezone()).toBe("UTC");
  });

  it("falls back to UTC when resolvedOptions throws", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(
      () => {
        throw new Error("Intl unavailable");
      }
    );

    expect(getBrowserTimezone()).toBe("UTC");
  });
});
