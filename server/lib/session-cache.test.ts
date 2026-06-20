import { describe, expect, it, vi } from "vitest";
import {
  getSessionCacheKey,
  invalidateSessionCache,
  invalidateSessionCachesForHouseholdMembers,
} from "./session-cache";

describe("session cache helpers", () => {
  it("builds cache keys with auth identifiers", () => {
    expect(getSessionCacheKey("user_123")).toBe("session:user_123");
  });

  it("skips invalidation when auth identifiers are missing", async () => {
    const kv = { delete: vi.fn() } as unknown as KVNamespace;

    await invalidateSessionCache(kv, null);

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
      [{ authId: "user_1" }, { authId: "user_2" }, { authId: null }]
    );

    expect(deleteFn).toHaveBeenCalledTimes(2);
    expect(deleteFn).toHaveBeenNthCalledWith(1, "session:user_1");
    expect(deleteFn).toHaveBeenNthCalledWith(2, "session:user_2");
  });
});
