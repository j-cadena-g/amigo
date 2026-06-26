import { describe, expect, it } from "vitest";
import { buildHouseholdBroadcastUrl } from "./realtime";

describe("buildHouseholdBroadcastUrl", () => {
  it("builds the default broadcast URL without a sender", () => {
    expect(buildHouseholdBroadcastUrl()).toBe("https://do/broadcast");
  });

  it("includes the sender identifier when provided", () => {
    expect(buildHouseholdBroadcastUrl("user_123")).toBe(
      "https://do/broadcast?senderId=user_123"
    );
  });
});
