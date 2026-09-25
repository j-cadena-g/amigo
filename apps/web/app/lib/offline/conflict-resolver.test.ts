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
      isPurchased: true,
      tagIds: ["t1"],
      _serverVersion: 20,
      _syncStatus: "pending",
    });
  });
});
