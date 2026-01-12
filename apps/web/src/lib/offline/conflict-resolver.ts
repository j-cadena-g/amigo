import type { OfflineGroceryItem } from "./db";

export interface ServerGroceryItem {
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
}

export type ResolutionStrategy =
  | "server-wins"
  | "local-wins"
  | "merge";

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
  const serverTimestamp = new Date(serverItem.updatedAt).getTime();
  return serverTimestamp > localItem._serverVersion;
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
  const serverTimestamp = new Date(serverItem.updatedAt).getTime();
  if (localItem._serverVersion === serverTimestamp) {
    return "local-wins";
  }

  // Both changed - use last-write-wins by timestamp
  const localTimestamp = new Date(localItem.updatedAt).getTime();
  if (localTimestamp > serverTimestamp) {
    return "local-wins";
  }

  // For purchased status specifically, more recent wins
  if (localItem.isPurchased !== serverItem.isPurchased) {
    const localPurchaseTime = localItem.purchasedAt
      ? new Date(localItem.purchasedAt).getTime()
      : localTimestamp;
    const serverPurchaseTime = serverItem.purchasedAt
      ? new Date(serverItem.purchasedAt).getTime()
      : serverTimestamp;

    return localPurchaseTime > serverPurchaseTime ? "local-wins" : "server-wins";
  }

  // Default to server for other conflicts
  return "server-wins";
}

export function mergeItems(
  local: OfflineGroceryItem,
  server: ServerGroceryItem,
  strategy: ResolutionStrategy
): OfflineGroceryItem {
  const serverTimestamp = new Date(server.updatedAt).getTime();

  if (strategy === "server-wins") {
    return {
      ...server,
      createdByUserDisplayName: server.createdByUserDisplayName ?? null,
      _localVersion: 0,
      _serverVersion: serverTimestamp,
      _syncStatus: "synced",
    };
  }

  if (strategy === "local-wins") {
    return {
      ...local,
      _serverVersion: serverTimestamp,
      _syncStatus: "pending", // Still needs to sync to server
    };
  }

  // Merge strategy - field-level merging based on timestamps
  const localTimestamp = new Date(local.updatedAt).getTime();
  const useServer = serverTimestamp > localTimestamp;

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
    updatedAt: new Date(Math.max(localTimestamp, serverTimestamp)),
    deletedAt: server.deletedAt, // Respect server deletions
    _localVersion: local._localVersion,
    _serverVersion: serverTimestamp,
    _syncStatus: useServer ? "synced" : "pending",
  };
}
