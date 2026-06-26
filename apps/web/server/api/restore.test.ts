import { describe, expect, it } from "vitest";
import { getClerkIdentity } from "../lib/clerk";

describe("getClerkIdentity", () => {
  it("normalizes Clerk identity payloads without organization fields", () => {
    expect(
      getClerkIdentity({ userId: "user_1", sessionClaims: {} })
    ).toEqual({
      userId: "user_1",
      email: undefined,
      name: undefined,
    });

    expect(
      getClerkIdentity({
        userId: "user_1",
        sessionClaims: {
          email: "member@example.com",
          name: "Member",
        },
      })
    ).toEqual({
      userId: "user_1",
      email: "member@example.com",
      name: "Member",
    });
  });
});
