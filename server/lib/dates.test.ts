import { describe, expect, it } from "vitest";
import {
  endOfIsoDayInTz,
  startOfIsoDayInTz,
  toISODateInTz,
  zonedDateTimeToUtc,
} from "./dates";

describe("zonedDateTimeToUtc", () => {
  it("maps household-local midnight to the correct UTC instant", () => {
    const instant = startOfIsoDayInTz("2024-01-15", "America/New_York");
    expect(instant.toISOString()).toBe("2024-01-15T05:00:00.000Z");
    expect(toISODateInTz(instant, "America/New_York")).toBe("2024-01-15");
  });

  it("keeps late-evening purchases on the same household calendar day", () => {
    const instant = zonedDateTimeToUtc(
      "2024-01-31",
      "23:00:00",
      "America/Los_Angeles"
    );
    expect(toISODateInTz(instant, "America/Los_Angeles")).toBe("2024-01-31");
    expect(instant.getTime()).toBeLessThanOrEqual(
      endOfIsoDayInTz("2024-01-31", "America/Los_Angeles").getTime()
    );
  });
});
