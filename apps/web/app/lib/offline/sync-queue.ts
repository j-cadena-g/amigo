import { getOfflineDB, type SyncQueueEntry } from "./db";
import { applyQueuedMutationToItems } from "./local-mutations";

export type SyncOperation = "add" | "toggle" | "delete" | "updateTags";

export interface QueuedMutation {
  operation: SyncOperation;
  entityType: "groceryItem" | "groceryTag";
  entityId: string;
  payload: Record<string, unknown>;
}

export function compareSyncQueueEntries(
  a: { timestamp: number; sequence?: number },
  b: { timestamp: number; sequence?: number }
): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  return (a.sequence ?? 0) - (b.sequence ?? 0);
}

export async function queueMutation(mutation: QueuedMutation): Promise<string> {
  const db = getOfflineDB();
  const id = crypto.randomUUID();

  await db.transaction(
    "rw",
    db.syncQueue,
    db.groceryItems,
    db.syncMetadata,
    async () => {
      const seqMeta = await db.syncMetadata.get("mutationSequence");
      const sequence =
        (typeof seqMeta?.value === "number" ? seqMeta.value : 0) + 1;
      await db.syncMetadata.put({ key: "mutationSequence", value: sequence });

      const entry: SyncQueueEntry = {
        id,
        timestamp: Date.now(),
        sequence,
        ...mutation,
        retryCount: 0,
        lastError: null,
      };
      await db.syncQueue.add(entry);

      const household = await db.syncMetadata.get("householdId");
      const user = await db.syncMetadata.get("userId");
      if (
        household?.value != null &&
        user?.value != null &&
        mutation.entityType === "groceryItem"
      ) {
        const existing = await db.groceryItems.toArray();
        const next = applyQueuedMutationToItems(existing, mutation, {
          householdId: String(household.value),
          userId: String(user.value),
        });
        const row = next.find((item) => item.id === mutation.entityId);
        if (row) {
          await db.groceryItems.put(row);
        }
      }
    }
  );

  // Attempt immediate sync if online
  if (typeof navigator !== "undefined" && navigator.onLine) {
    triggerBackgroundSync();
  }

  return id;
}

export async function getPendingMutations(): Promise<SyncQueueEntry[]> {
  const db = getOfflineDB();
  const entries = await db.syncQueue.toArray();
  return entries.sort(compareSyncQueueEntries);
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

// processSyncQueue is the live discard path; this helper remains for manual cleanup.
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
        return (
          registration as ServiceWorkerRegistration & {
            sync: { register: (tag: string) => Promise<void> };
          }
        ).sync.register("sync-groceries");
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

export async function setOfflineSessionContext(
  householdId: string,
  userId: string
): Promise<void> {
  const db = getOfflineDB();
  await db.syncMetadata.put({ key: "householdId", value: householdId });
  await db.syncMetadata.put({ key: "userId", value: userId });
}

export async function getOfflineSessionContext(): Promise<{
  householdId: string;
  userId: string;
} | null> {
  const db = getOfflineDB();
  const household = await db.syncMetadata.get("householdId");
  const user = await db.syncMetadata.get("userId");
  if (household?.value == null || user?.value == null) return null;
  return {
    householdId: String(household.value),
    userId: String(user.value),
  };
}
