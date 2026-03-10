import { getOfflineDB, type SyncQueueEntry } from "./db";

export type SyncOperation = "add" | "toggle" | "delete" | "updateTags";

export interface QueuedMutation {
  operation: SyncOperation;
  entityType: "groceryItem" | "groceryTag";
  entityId: string;
  payload: Record<string, unknown>;
}

export async function queueMutation(mutation: QueuedMutation): Promise<string> {
  const db = getOfflineDB();
  const id = crypto.randomUUID();
  const entry: SyncQueueEntry = {
    id,
    timestamp: Date.now(),
    ...mutation,
    retryCount: 0,
    lastError: null,
  };

  await db.syncQueue.add(entry);

  // Attempt immediate sync if online
  if (typeof navigator !== "undefined" && navigator.onLine) {
    triggerBackgroundSync();
  }

  return entry.id;
}

export async function getPendingMutations(): Promise<SyncQueueEntry[]> {
  const db = getOfflineDB();
  return db.syncQueue.orderBy("timestamp").toArray();
}

export async function getPendingCount(): Promise<number> {
  const db = getOfflineDB();
  return db.syncQueue.count();
}

export async function removeMutation(id: string): Promise<void> {
  const db = getOfflineDB();
  await db.syncQueue.delete(id);
}

export async function markMutationFailed(
  id: string,
  error: string
): Promise<void> {
  const db = getOfflineDB();
  const entry = await db.syncQueue.get(id);
  if (entry) {
    await db.syncQueue.update(id, {
      retryCount: entry.retryCount + 1,
      lastError: error,
    });
  }
}

export async function clearFailedMutations(maxRetries = 5): Promise<number> {
  const db = getOfflineDB();
  const failed = await db.syncQueue
    .filter((entry) => entry.retryCount >= maxRetries)
    .toArray();

  for (const entry of failed) {
    await db.syncQueue.delete(entry.id);
  }

  return failed.length;
}

function triggerBackgroundSync(): void {
  if (
    "serviceWorker" in navigator &&
    "sync" in (ServiceWorkerRegistration.prototype as object)
  ) {
    navigator.serviceWorker.ready
      .then((registration) => {
        return (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register("sync-groceries");
      })
      .catch(() => {
        // Background sync registration failed - will retry on next mutation
      });
  }
}

export async function getLastSyncTimestamp(): Promise<number> {
  const db = getOfflineDB();
  const meta = await db.syncMetadata.get("lastSyncTimestamp");
  return meta ? Number(meta.value) : 0;
}

export async function setLastSyncTimestamp(timestamp: number): Promise<void> {
  const db = getOfflineDB();
  await db.syncMetadata.put({
    key: "lastSyncTimestamp",
    value: timestamp,
  });
}
