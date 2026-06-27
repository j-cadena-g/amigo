import { getOfflineDB, type OfflineGroceryItem, type OfflineGroceryTag } from "./db";
import { setLastSyncTimestamp, setOfflineSessionContext } from "./sync-queue";
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
  purchasedAt: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  tags?: Array<{ id: string; name: string; color: string }>;
}

export interface GroceryTag {
  id: string;
  householdId: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export async function hydrateFromServer(
  items: GroceryItemWithTags[],
  tags: GroceryTag[],
  session?: { householdId: string; userId: string }
): Promise<void> {
  if (session) {
    await setOfflineSessionContext(session.householdId, session.userId);
  }
  const db = getOfflineDB();
  const existingCount = await db.groceryItems.count();

  if (existingCount === 0) {
    await bulkInsertItems(items);
    await bulkInsertTags(tags);
    await setLastSyncTimestamp(Date.now());
    return;
  }

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
    tagIds: item.tags?.map((tag) => tag.id),
    _localVersion: 0,
    _serverVersion: item.updatedAt,
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

function toServerGroceryItem(item: GroceryItemWithTags): ServerGroceryItem {
  return {
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
    tagIds: item.tags?.map((tag) => tag.id),
  };
}

async function incrementalSync(
  serverItems: GroceryItemWithTags[],
  serverTags: GroceryTag[]
): Promise<void> {
  const db = getOfflineDB();

  for (const serverItem of serverItems) {
    const localItem = await db.groceryItems.get(serverItem.id);

    if (!localItem) {
      await db.groceryItems.add({
        ...serverItem,
        createdByUserDisplayName: serverItem.createdByUserDisplayName ?? null,
        tagIds: serverItem.tags?.map((tag) => tag.id),
        _localVersion: 0,
        _serverVersion: serverItem.updatedAt,
        _syncStatus: "synced",
      });
      continue;
    }

    if (localItem._syncStatus === "synced") {
      await db.groceryItems.update(serverItem.id, {
        ...serverItem,
        tagIds: serverItem.tags?.map((tag) => tag.id),
        _serverVersion: serverItem.updatedAt,
        _syncStatus: "synced",
      });
      continue;
    }

    const serverGroceryItem = toServerGroceryItem(serverItem);

    const hasConflict = detectConflict({
      localItem,
      serverItem: serverGroceryItem,
    });

    if (!hasConflict) {
      await db.groceryItems.update(serverItem.id, {
        _serverVersion: serverItem.updatedAt,
      });
      continue;
    }

    const strategy = resolveConflict({
      localItem,
      serverItem: serverGroceryItem,
    });

    const merged = mergeItems(localItem, serverGroceryItem, strategy);
    await db.groceryItems.put(merged);
  }

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

export async function getOfflineItems(
  householdId?: string
): Promise<OfflineGroceryItem[]> {
  const db = getOfflineDB();
  if (!householdId) {
    return db.groceryItems.filter((item) => item.deletedAt === null).toArray();
  }
  return db.groceryItems
    .where("householdId")
    .equals(householdId)
    .filter((item) => item.deletedAt === null)
    .toArray();
}

export async function getOfflineTags(
  householdId?: string
): Promise<OfflineGroceryTag[]> {
  const db = getOfflineDB();
  if (!householdId) return db.groceryTags.toArray();
  return db.groceryTags.where("householdId").equals(householdId).toArray();
}

export async function hasOfflineData(): Promise<boolean> {
  const db = getOfflineDB();
  const count = await db.groceryItems.count();
  return count > 0;
}

export async function clearOfflineData(): Promise<void> {
  const db = getOfflineDB();
  await db.groceryItems.clear();
  await db.groceryTags.clear();
  await db.syncQueue.clear();
  await db.syncMetadata.clear();
}

export { getLastSyncTimestamp } from "./sync-queue";
