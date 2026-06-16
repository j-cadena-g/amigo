import { describe, expect, it } from "vitest";
import { getClerkIdentity } from "../lib/clerk";

describe("restore identity", () => {
  it("normalizes Clerk identity payloads (orgId remains optional at parse time)", () => {
    expect(getClerkIdentity(null)).toBeNull();
    expect(
      getClerkIdentity({ userId: "user_1", orgId: undefined })
    ).toEqual({
      userId: "user_1",
      orgId: undefined,
      email: undefined,
      name: undefined,
    });
    expect(
      getClerkIdentity({
        userId: "user_1",
        orgId: "org_1",
        sessionClaims: { email: "a@b.com", name: "A" },
      })
    ).toEqual({
      userId: "user_1",
      orgId: "org_1",
      email: "a@b.com",
      name: "A",
    });
  });
});
