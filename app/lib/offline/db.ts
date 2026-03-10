import Dexie, { type Table } from "dexie";

export interface OfflineGroceryItem {
  id: string;
  householdId: string;
  createdByUserId: string | null;
  createdByUserDisplayName: string | null;
  itemName: string;
  category: string | null;
  isPurchased: boolean;
  purchasedAt: number | null; // timestamp_ms (D1 stores as integer)
  createdAt: number; // timestamp_ms
  updatedAt: number; // timestamp_ms
  deletedAt: number | null; // timestamp_ms
  _localVersion: number;
  _serverVersion: number;
  _syncStatus: "synced" | "pending" | "conflict";
}

export interface OfflineGroceryTag {
  id: string;
  householdId: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  _syncStatus: "synced" | "pending";
}

export interface SyncQueueEntry {
  id: string;
  timestamp: number;
  operation: "add" | "toggle" | "delete" | "updateTags";
  entityType: "groceryItem" | "groceryTag";
  entityId: string;
  payload: Record<string, unknown>;
  retryCount: number;
  lastError: string | null;
}

export interface SyncMetadata {
  key: string;
  value: string | number;
}

class AmigoOfflineDB extends Dexie {
  groceryItems!: Table<OfflineGroceryItem, string>;
  groceryTags!: Table<OfflineGroceryTag, string>;
  syncQueue!: Table<SyncQueueEntry, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super("amigo-offline");

    this.version(1).stores({
      groceryItems: "id, householdId, updatedAt, _syncStatus",
      groceryTags: "id, householdId, _syncStatus",
      syncQueue: "id, timestamp, entityType, entityId",
      syncMetadata: "key",
    });
  }
}

let offlineDB: AmigoOfflineDB | null = null;

export function getOfflineDB(): AmigoOfflineDB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in browser");
  }
  if (!offlineDB) {
    offlineDB = new AmigoOfflineDB();
  }
  return offlineDB;
}

export async function isOfflineSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("indexedDB" in window)) return false;

  try {
    const testDB = indexedDB.open("test-db", 1);
    return new Promise((resolve) => {
      testDB.onerror = () => resolve(false);
      testDB.onsuccess = () => {
        testDB.result.close();
        indexedDB.deleteDatabase("test-db");
        resolve(true);
      };
    });
  } catch {
    return false;
  }
}
