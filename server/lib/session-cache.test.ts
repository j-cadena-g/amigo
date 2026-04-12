import { describe, expect, it, vi } from "vitest";
import {
  getSessionCacheKey,
  invalidateSessionCache,
  invalidateSessionCachesForHouseholdMembers,
} from "./session-cache";

describe("session cache helpers", () => {
  it("builds cache keys with auth and org identifiers", () => {
    expect(getSessionCacheKey("user_123", "org_456")).toBe(
      "session:user_123:org_456"
    );
  });

  it("skips invalidation when auth or org identifiers are missing", async () => {
    const kv = { delete: vi.fn() } as unknown as KVNamespace;

    await invalidateSessionCache(kv, "user_123", null);
    await invalidateSessionCache(kv, null, "org_456");

    expect(kv.delete).not.toHaveBeenCalled();
  });

  it("invalidates every provided household member session", async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const env = {
      CACHE: { delete: deleteFn },
    } as unknown as {
      CACHE: KVNamespace;
    };

    await invalidateSessionCachesForHouseholdMembers(
      env as never,
      [
        { authId: "user_1", orgId: "org_1" },
        { authId: "user_2", orgId: "org_1" },
        { authId: null, orgId: "org_1" },
      ]
    );

    expect(deleteFn).toHaveBeenCalledTimes(2);
    expect(deleteFn).toHaveBeenNthCalledWith(1, "session:user_1:org_1");
    expect(deleteFn).toHaveBeenNthCalledWith(2, "session:user_2:org_1");
  });
});
