import { describe, expect, it } from "vitest";
import { pushSubscriptionKeysMissing } from "./client";

describe("pushSubscriptionKeysMissing", () => {
  it("is true when either crypto key is missing", () => {
    expect(pushSubscriptionKeysMissing(null, new ArrayBuffer(8))).toBe(true);
    expect(pushSubscriptionKeysMissing(new ArrayBuffer(8), null)).toBe(true);
    expect(pushSubscriptionKeysMissing(null, null)).toBe(true);
  });

  it("is false when both keys are present", () => {
    expect(
      pushSubscriptionKeysMissing(new ArrayBuffer(8), new ArrayBuffer(8))
    ).toBe(false);
  });
});
