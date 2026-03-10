export { getOfflineDB, isOfflineSupported } from "./db";
export type { OfflineGroceryItem, OfflineGroceryTag, SyncQueueEntry } from "./db";

export { queueMutation, getPendingCount, getLastSyncTimestamp } from "./sync-queue";
export type { QueuedMutation, SyncOperation } from "./sync-queue";

export { processSyncQueue, syncWithServer, hasPendingMutations } from "./sync-processor";

export {
  hydrateFromServer,
  getOfflineItems,
  getOfflineTags,
  hasOfflineData,
  clearOfflineData,
} from "./hydration";
export type { GroceryItemWithTags, GroceryTag } from "./hydration";

export { detectConflict, resolveConflict, mergeItems } from "./conflict-resolver";
export type { ServerGroceryItem, ResolutionStrategy } from "./conflict-resolver";
