import { describe, expect, it } from "vitest";
import { partitionViableMutations } from "./sync-processor";

describe("partitionViableMutations", () => {
  it("separates expired retries", () => {
    const { viable, expired } = partitionViableMutations([
      { retryCount: 0 },
      { retryCount: 5 },
      { retryCount: 4 },
      { retryCount: 6 },
    ]);
    expect(viable.map((m) => m.retryCount)).toEqual([0, 4]);
    expect(expired.map((m) => m.retryCount)).toEqual([5, 6]);
  });
});
