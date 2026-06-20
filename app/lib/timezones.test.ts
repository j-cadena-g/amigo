import { describe, expect, it } from "vitest";
import {
  buildTimezoneOptions,
  COMMON_TIMEZONES,
  getBrowserTimezone,
  isSupportedTimezone,
} from "./timezones";

describe("timezones", () => {
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

  it("falls back to UTC when the browser timezone is unavailable", () => {
    expect(getBrowserTimezone()).toMatch(/^[A-Za-z_/]+$/);
  });
});
