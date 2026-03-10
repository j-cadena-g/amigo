import type { OfflineGroceryItem } from "./db";

export interface ServerGroceryItem {
  id: string;
  householdId: string;
  createdByUserId: string | null;
  createdByUserDisplayName: string | null;
  itemName: string;
  category: string | null;
  isPurchased: boolean;
  purchasedAt: number | null; // timestamp_ms
  createdAt: number; // timestamp_ms
  updatedAt: number; // timestamp_ms
  deletedAt: number | null; // timestamp_ms
}

export type ResolutionStrategy = "server-wins" | "local-wins" | "merge";

interface ConflictContext {
  localItem: OfflineGroceryItem;
  serverItem: ServerGroceryItem;
}

export function detectConflict(context: ConflictContext): boolean {
  const { localItem, serverItem } = context;

  // No conflict if local hasn't changed since last sync
  if (localItem._syncStatus === "synced") {
    return false;
  }

  // Conflict exists if server changed since our last known version
  return serverItem.updatedAt > localItem._serverVersion;
}

export function resolveConflict(context: ConflictContext): ResolutionStrategy {
  const { localItem, serverItem } = context;

  // Server deleted - always respect deletions
  if (serverItem.deletedAt !== null) {
    return "server-wins";
  }

  // Local item was created offline (never synced to server)
  if (localItem._serverVersion === 0) {
    return "local-wins";
  }

  // Server unchanged since last sync - local wins
  if (localItem._serverVersion === serverItem.updatedAt) {
    return "local-wins";
  }

  // Both changed - use last-write-wins by timestamp
  if (localItem.updatedAt > serverItem.updatedAt) {
    return "local-wins";
  }

  // For purchased status specifically, more recent wins
  if (localItem.isPurchased !== serverItem.isPurchased) {
    const localPurchaseTime = localItem.purchasedAt ?? localItem.updatedAt;
    const serverPurchaseTime = serverItem.purchasedAt ?? serverItem.updatedAt;
    return localPurchaseTime > serverPurchaseTime ? "local-wins" : "server-wins";
  }

  return "server-wins";
}

export function mergeItems(
  local: OfflineGroceryItem,
  server: ServerGroceryItem,
  strategy: ResolutionStrategy
): OfflineGroceryItem {
  if (strategy === "server-wins") {
    return {
      ...server,
      createdByUserDisplayName: server.createdByUserDisplayName ?? null,
      _localVersion: 0,
      _serverVersion: server.updatedAt,
      _syncStatus: "synced",
    };
  }

  if (strategy === "local-wins") {
    return {
      ...local,
      _serverVersion: server.updatedAt,
      _syncStatus: "pending",
    };
  }

  // Merge strategy - field-level merging based on timestamps
  const useServer = server.updatedAt > local.updatedAt;

  return {
    id: local.id,
    householdId: local.householdId,
    createdByUserId: local.createdByUserId,
    createdByUserDisplayName:
      server.createdByUserDisplayName ?? local.createdByUserDisplayName,
    itemName: useServer ? server.itemName : local.itemName,
    category: useServer ? server.category : local.category,
    isPurchased: useServer ? server.isPurchased : local.isPurchased,
    purchasedAt: useServer ? server.purchasedAt : local.purchasedAt,
    createdAt: local.createdAt,
    updatedAt: Math.max(local.updatedAt, server.updatedAt),
    deletedAt: server.deletedAt,
    _localVersion: local._localVersion,
    _serverVersion: server.updatedAt,
    _syncStatus: useServer ? "synced" : "pending",
  };
}
