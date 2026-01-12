import { getOfflineDB, type OfflineGroceryItem, type OfflineGroceryTag } from "./db";
import { setLastSyncTimestamp, getLastSyncTimestamp } from "./sync-queue";
import {
  detectConflict,
  resolveConflict,
  mergeItems,
  type ServerGroceryItem,
} from "./conflict-resolver";

export interface GroceryItemWithTags {
  id: string;
  householdId: string;
  createdByUserId: string | null;
  createdByUserDisplayName: string | null;
  itemName: string;
  category: string | null;
  isPurchased: boolean;
  purchasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  tags?: Array<{ id: string; name: string; color: string }>;
}

export interface GroceryTag {
  id: string;
  householdId: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

// Hydrate IndexedDB from server data
export async function hydrateFromServer(
  items: GroceryItemWithTags[],
  tags: GroceryTag[]
): Promise<void> {
  const db = getOfflineDB();
  const existingCount = await db.groceryItems.count();

  if (existingCount === 0) {
    // First load - bulk insert
    await bulkInsertItems(items);
    await bulkInsertTags(tags);
    await setLastSyncTimestamp(Date.now());
    return;
  }

  // Incremental sync - merge with existing data
  await incrementalSync(items, tags);
}

async function bulkInsertItems(items: GroceryItemWithTags[]): Promise<void> {
  const db = getOfflineDB();
  const offlineItems: OfflineGroceryItem[] = items.map((item) => ({
    id: item.id,
    householdId: item.householdId,
    createdByUserId: item.createdByUserId,
    createdByUserDisplayName: item.createdByUserDisplayName,
    itemName: item.itemName,
    category: item.category,
    isPurchased: item.isPurchased,
    purchasedAt: item.purchasedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
    _localVersion: 0,
    _serverVersion: new Date(item.updatedAt).getTime(),
    _syncStatus: "synced",
  }));

  await db.groceryItems.bulkPut(offlineItems);
}

async function bulkInsertTags(tags: GroceryTag[]): Promise<void> {
  const db = getOfflineDB();
  const offlineTags: OfflineGroceryTag[] = tags.map((tag) => ({
    id: tag.id,
    householdId: tag.householdId,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
    _syncStatus: "synced",
  }));

  await db.groceryTags.bulkPut(offlineTags);
}

async function incrementalSync(
  serverItems: GroceryItemWithTags[],
  serverTags: GroceryTag[]
): Promise<void> {
  const db = getOfflineDB();

  // Process each server item
  for (const serverItem of serverItems) {
    const localItem = await db.groceryItems.get(serverItem.id);

    if (!localItem) {
      // New item from server - add it
      await db.groceryItems.add({
        ...serverItem,
        createdByUserDisplayName: serverItem.createdByUserDisplayName ?? null,
        _localVersion: 0,
        _serverVersion: new Date(serverItem.updatedAt).getTime(),
        _syncStatus: "synced",
      });
      continue;
    }

    // Item exists locally
    if (localItem._syncStatus === "synced") {
      // No local changes - update from server
      await db.groceryItems.update(serverItem.id, {
        ...serverItem,
        _serverVersion: new Date(serverItem.updatedAt).getTime(),
        _syncStatus: "synced",
      });
      continue;
    }

    // Local has pending changes - check for conflict
    const hasConflict = detectConflict({
      localItem,
      serverItem: serverItem as ServerGroceryItem,
    });

    if (!hasConflict) {
      // Server hasn't changed since our last sync - keep local changes
      await db.groceryItems.update(serverItem.id, {
        _serverVersion: new Date(serverItem.updatedAt).getTime(),
      });
      continue;
    }

    // Conflict detected - resolve it
    const strategy = resolveConflict({
      localItem,
      serverItem: serverItem as ServerGroceryItem,
    });

    const merged = mergeItems(
      localItem,
      serverItem as ServerGroceryItem,
      strategy
    );
    await db.groceryItems.put(merged);
  }

  // Update tags (simpler - no conflict resolution for tags)
  for (const tag of serverTags) {
    const localTag = await db.groceryTags.get(tag.id);
    if (!localTag || localTag._syncStatus === "synced") {
      await db.groceryTags.put({
        ...tag,
        _syncStatus: "synced",
      });
    }
  }

  await setLastSyncTimestamp(Date.now());
}

// Get all items from IndexedDB
export async function getOfflineItems(): Promise<OfflineGroceryItem[]> {
  const db = getOfflineDB();
  return db.groceryItems
    .filter((item) => item.deletedAt === null)
    .toArray();
}

// Get all tags from IndexedDB
export async function getOfflineTags(): Promise<OfflineGroceryTag[]> {
  const db = getOfflineDB();
  return db.groceryTags.toArray();
}

// Check if we have any data cached
export async function hasOfflineData(): Promise<boolean> {
  const db = getOfflineDB();
  const count = await db.groceryItems.count();
  return count > 0;
}

// Clear all offline data (useful for logout)
export async function clearOfflineData(): Promise<void> {
  const db = getOfflineDB();
  await db.groceryItems.clear();
  await db.groceryTags.clear();
  await db.syncQueue.clear();
  await db.syncMetadata.clear();
}

// Export for use in sync processor
export { getLastSyncTimestamp };
