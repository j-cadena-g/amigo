import { describe, expect, it } from "vitest";
import { getClerkIdentity } from "./clerk";

describe("getClerkIdentity", () => {
  it("returns null when no user id is present", () => {
    expect(getClerkIdentity(null)).toBeNull();
    expect(
      getClerkIdentity({
        userId: null,
        sessionClaims: { email: "james@example.com" },
      })
    ).toBeNull();
  });

  it("returns null when user id is an empty string", () => {
    expect(
      getClerkIdentity({
        userId: "",
        sessionClaims: { email: "james@example.com" },
      })
    ).toBeNull();
  });

  it("normalizes string claims and ignores non-string values", () => {
    expect(
      getClerkIdentity({
        userId: "user_123",
        sessionClaims: {
          email: "james@example.com",
          name: 42,
        },
      })
    ).toEqual({
      userId: "user_123",
      email: "james@example.com",
      name: undefined,
    });
  });

  it("preserves identity when session claims are omitted", () => {
    expect(
      getClerkIdentity({
        userId: "user_123",
      })
    ).toEqual({
      userId: "user_123",
      email: undefined,
      name: undefined,
    });
  });
});
