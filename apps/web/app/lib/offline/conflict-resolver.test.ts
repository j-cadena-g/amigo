import { describe, expect, it } from "vitest";
import { mergeItems, type ServerGroceryItem } from "./conflict-resolver";
import type { OfflineGroceryItem } from "./db";

const local: OfflineGroceryItem = {
  id: "g1",
  householdId: "hh1",
  createdByUserId: "u1",
  createdByUserDisplayName: null,
  itemName: "leche",
  category: "Dairy",
  categorySource: "ai",
  isPurchased: true,
  purchasedAt: 30,
  createdAt: 1,
  updatedAt: 30,
  deletedAt: null,
  tagIds: ["t1"],
  _localVersion: 1,
  _serverVersion: 10,
  _syncStatus: "pending",
};

const server: ServerGroceryItem = {
  id: "g1",
  householdId: "hh1",
  createdByUserId: "u1",
  createdByUserDisplayName: null,
  itemName: "leche",
  category: "Dairy & Eggs",
  categorySource: "user",
  isPurchased: false,
  purchasedAt: null,
  createdAt: 1,
  updatedAt: 20,
  deletedAt: null,
  tagIds: [],
};

describe("mergeItems", () => {
  it("keeps local edits but takes the server's aisle when local wins", () => {
    const merged = mergeItems(local, server, "local-wins");

    expect(merged).toMatchObject({
      category: "Dairy & Eggs",
      categorySource: "user",
      isPurchased: true,
      tagIds: ["t1"],
      _serverVersion: 20,
      _syncStatus: "pending",
    });
  });

  it("takes the server aisle and source when merging, even if local is newer", () => {
    const serverNewer = mergeItems(
      { ...local, updatedAt: 10, category: "Dairy", categorySource: "ai" },
      { ...server, updatedAt: 40, category: "Pantry", categorySource: "user" },
      "merge"
    );
    expect(serverNewer.category).toBe("Pantry");
    expect(serverNewer.categorySource).toBe("user");

    // A member pinned the aisle on the server while this device was offline.
    const localNewer = mergeItems(
      { ...local, updatedAt: 50, category: "Dairy", categorySource: "ai" },
      { ...server, updatedAt: 20, category: "Pantry", categorySource: "user" },
      "merge"
    );
    expect(localNewer.category).toBe("Pantry");
    expect(localNewer.categorySource).toBe("user");
  });

  it("takes the server aisle and source when the server wins", () => {
    const merged = mergeItems(
      { ...local, category: "Dairy", categorySource: "user" },
      { ...server, category: "Pantry", categorySource: "ai" },
      "server-wins"
    );

    expect(merged.category).toBe("Pantry");
    expect(merged.categorySource).toBe("ai");
  });
});
