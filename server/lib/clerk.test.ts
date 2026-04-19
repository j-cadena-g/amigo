import { describe, expect, it } from "vitest";
import { getClerkIdentity } from "./clerk";

describe("getClerkIdentity", () => {
  it("returns null when no user id is present", () => {
    expect(getClerkIdentity(null)).toBeNull();
    expect(
      getClerkIdentity({
        userId: null,
        orgId: "org_123",
        sessionClaims: { email: "james@example.com" },
      })
    ).toBeNull();
  });

  it("normalizes string claims and ignores non-string values", () => {
    expect(
      getClerkIdentity({
        userId: "user_123",
        orgId: "org_123",
        sessionClaims: {
          email: "james@example.com",
          name: 42,
        },
      })
    ).toEqual({
      userId: "user_123",
      orgId: "org_123",
      email: "james@example.com",
      name: undefined,
    });
  });
});
