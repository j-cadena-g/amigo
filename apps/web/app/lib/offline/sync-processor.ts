import {
  getOfflineDB,
  type OfflineGroceryItem,
  type SyncQueueEntry,
} from "./db";
import {
  getPendingMutations,
  removeMutation,
  markMutationFailed,
  setLastSyncTimestamp,
} from "./sync-queue";

const MAX_RETRIES = 5;
const SYNC_BATCH_SIZE = 10;

type QueueLike = {
  id: string;
  operation: SyncQueueEntry["operation"];
  entityType: SyncQueueEntry["entityType"];
  entityId: string;
  retryCount: number;
};

export function partitionViableMutations<T extends { retryCount: number }>(
  mutations: T[],
  maxRetries = MAX_RETRIES
): { viable: T[]; expired: T[] } {
  return {
    viable: mutations.filter((m) => m.retryCount < maxRetries),
    expired: mutations.filter((m) => m.retryCount >= maxRetries),
  };
}

/**
 * When an offline `add` is permanently discarded, dependent mutations for the
 * same temporary entityId can never succeed on the server — discard them too.
 */
export function cascadeExpiredAddDependents<T extends QueueLike>(
  viable: T[],
  expired: T[]
): { viable: T[]; expired: T[] } {
  const expiredAddEntityIds = new Set(
    expired
      .filter(
        (m) => m.operation === "add" && m.entityType === "groceryItem"
      )
      .map((m) => m.entityId)
  );
  if (expiredAddEntityIds.size === 0) {
    return { viable, expired };
  }

  const cascaded: T[] = [];
  const kept: T[] = [];
  for (const mutation of viable) {
    if (expiredAddEntityIds.has(mutation.entityId)) {
      cascaded.push(mutation);
    } else {
      kept.push(mutation);
    }
  }
  return { viable: kept, expired: [...expired, ...cascaded] };
}

export function remapEntityIdInMutations<T extends { entityId: string }>(
  mutations: T[],
  fromId: string,
  toId: string
): T[] {
  if (fromId === toId) return mutations;
  return mutations.map((mutation) =>
    mutation.entityId === fromId ? { ...mutation, entityId: toId } : mutation
  );
}

/**
 * Take the next request batch. Close the batch immediately after a grocery
 * `add` so dependents are submitted only after the temp→server ID remap.
 */
export function takeNextSyncBatch<T extends QueueLike>(
  remaining: T[],
  maxSize = SYNC_BATCH_SIZE
): T[] {
  const batch: T[] = [];
  for (const mutation of remaining) {
    if (batch.length >= maxSize) break;

    batch.push(mutation);

    // Closing after add is what keeps dependents out of this request; remap
    // happens on `remaining` after the add succeeds.
    if (
      mutation.operation === "add" &&
      mutation.entityType === "groceryItem"
    ) {
      break;
    }
  }
  return batch;
}

/**
 * Revert local grocery projection for a permanently discarded queue entry so
 * orphan `_syncStatus: "pending"` rows do not linger in the UI.
 */
export async function reconcileDiscardedMutation(
  mutation: SyncQueueEntry
): Promise<void> {
  if (mutation.entityType !== "groceryItem") return;

  const db = getOfflineDB();
  const row = await db.groceryItems.get(mutation.entityId);
  if (!row || row._syncStatus !== "pending") return;

  if (mutation.operation === "add" && row._serverVersion === 0) {
    await db.groceryItems.delete(mutation.entityId);
    return;
  }

  // Let the next online hydrate overwrite any stale optimistic fields.
  await db.groceryItems.update(mutation.entityId, { _syncStatus: "synced" });
}

interface BatchSyncResponse {
  processed: number;
  failed: number;
  results: Array<{
    id: string;
    success: boolean;
    serverItem?: Record<string, unknown>;
    error?: string;
  }>;
}

function coerceTimestampMs(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

export async function processSyncQueue(): Promise<{
  processed: number;
  failed: number;
  discarded: number;
}> {
  const mutations = await getPendingMutations();
  if (mutations.length === 0) {
    return { processed: 0, failed: 0, discarded: 0 };
  }

  const partitioned = partitionViableMutations(mutations, MAX_RETRIES);
  const { viable, expired } = cascadeExpiredAddDependents(
    partitioned.viable,
    partitioned.expired
  );

  for (const m of expired) {
    await reconcileDiscardedMutation(m);
    await removeMutation(m.id);
  }

  let remaining = [...viable];
  let totalProcessed = 0;
  let totalFailed = 0;
  const discarded = expired.length;

  while (remaining.length > 0) {
    const batch = takeNextSyncBatch(remaining, SYNC_BATCH_SIZE);
    if (batch.length === 0) break;
    remaining = remaining.slice(batch.length);

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mutations: batch.map((m) => ({
            id: m.id,
            operation: m.operation,
            entityType: m.entityType,
            entityId: m.entityId,
            payload: m.payload,
          })),
        }),
      });

      if (!response.ok) {
        for (const m of batch) {
          await markMutationFailed(m.id, `Server returned ${response.status}`);
        }
        totalFailed += batch.length;
        // Whole-run failures: stop instead of burning retries on later batches.
        if (response.status >= 500 || response.status === 429) break;
        continue;
      }

      const result = (await response.json()) as BatchSyncResponse;

      for (const r of result.results) {
        if (r.success) {
          const mutation = batch.find((m) => m.id === r.id);
          if (!mutation) continue;

          let syncComplete = true;
          try {
            if (mutation.operation === "add") {
              if (!r.serverItem) {
                await markMutationFailed(
                  mutation.id,
                  "Server returned no usable item id"
                );
                totalFailed++;
                syncComplete = false;
              } else {
                const serverId = await updateLocalFromServer(
                  mutation,
                  r.serverItem
                );
                if (!serverId) {
                  await markMutationFailed(
                    mutation.id,
                    "Server returned no usable item id"
                  );
                  totalFailed++;
                  syncComplete = false;
                } else if (serverId !== mutation.entityId) {
                  remaining = remapEntityIdInMutations(
                    remaining,
                    mutation.entityId,
                    serverId
                  );
                }
              }
            } else if (r.serverItem) {
              await updateLocalFromServer(mutation, r.serverItem);
            }
          } catch (mergeError) {
            await markMutationFailed(
              mutation.id,
              mergeError instanceof Error
                ? mergeError.message
                : "Local merge failed"
            );
            totalFailed++;
            syncComplete = false;
          }

          if (syncComplete) {
            await removeMutation(mutation.id);
            totalProcessed++;
          }
        } else {
          const mutation = batch.find((m) => m.id === r.id);
          if (mutation) {
            await markMutationFailed(mutation.id, r.error ?? "Unknown error");
          }
          totalFailed++;
        }
      }

      const seen = new Set(result.results.map((r) => r.id));
      for (const m of batch) {
        if (seen.has(m.id)) continue;
        await markMutationFailed(m.id, "No result returned by server");
        totalFailed++;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Network error";
      for (const m of batch) {
        await markMutationFailed(m.id, errorMessage);
      }
      totalFailed += batch.length;
      break;
    }
  }

  if (totalProcessed > 0) {
    await setLastSyncTimestamp(Date.now());
  }

  return { processed: totalProcessed, failed: totalFailed, discarded };
}

export function mergeServerItemWithLocal(
  serverId: string,
  serverItem: Record<string, unknown>,
  fallback: OfflineGroceryItem | undefined,
  now: number
): OfflineGroceryItem {
  const tagIds = Array.isArray(serverItem.tagIds)
    ? serverItem.tagIds.filter((id): id is string => typeof id === "string")
    : fallback?.tagIds;

  return {
    id: serverId,
    householdId:
      typeof serverItem.householdId === "string"
        ? serverItem.householdId
        : (fallback?.householdId ?? ""),
    createdByUserId:
      typeof serverItem.createdByUserId === "string"
        ? serverItem.createdByUserId
        : (fallback?.createdByUserId ?? null),
    createdByUserDisplayName:
      typeof serverItem.createdByUserDisplayName === "string"
        ? serverItem.createdByUserDisplayName
        : (fallback?.createdByUserDisplayName ?? null),
    itemName:
      typeof serverItem.itemName === "string"
        ? serverItem.itemName
        : (fallback?.itemName ?? ""),
    category:
      typeof serverItem.category === "string"
        ? serverItem.category
        : (fallback?.category ?? null),
    isPurchased: Boolean(
      serverItem.isPurchased ?? fallback?.isPurchased ?? false
    ),
    purchasedAt:
      serverItem.purchasedAt == null
        ? null
        : coerceTimestampMs(serverItem.purchasedAt, now),
    createdAt: coerceTimestampMs(
      serverItem.createdAt,
      fallback?.createdAt ?? now
    ),
    updatedAt: coerceTimestampMs(serverItem.updatedAt, now),
    deletedAt:
      serverItem.deletedAt == null
        ? null
        : coerceTimestampMs(serverItem.deletedAt, now),
    tagIds,
    _localVersion: 0,
    _serverVersion: coerceTimestampMs(serverItem.updatedAt, now),
    _syncStatus: "synced",
  };
}

async function updateLocalFromServer(
  mutation: SyncQueueEntry,
  serverItem: Record<string, unknown>
): Promise<string | null> {
  const db = getOfflineDB();
  const rawId = serverItem.id;
  const serverId =
    typeof rawId === "string" && rawId.trim() !== "" ? rawId : null;
  if (!serverId) return null;

  const now = Date.now();
  const tempId = mutation.entityId;

  await db.transaction("rw", db.groceryItems, db.syncQueue, async () => {
    let tempItem: OfflineGroceryItem | undefined;
    if (mutation.operation === "add" && tempId !== serverId) {
      // Capture before delete so tagIds / local fields survive the remap.
      tempItem = await db.groceryItems.get(tempId);
      if (tempItem) {
        await db.groceryItems.delete(tempId);
      }

      const pending = await db.syncQueue
        .where("entityId")
        .equals(tempId)
        .toArray();
      for (const entry of pending) {
        if (entry.id === mutation.id) continue;
        await db.syncQueue.update(entry.id, { entityId: serverId });
      }
    }

    const existing = await db.groceryItems.get(serverId);
    const fallback = existing ?? tempItem;
    await db.groceryItems.put(
      mergeServerItemWithLocal(serverId, serverItem, fallback, now)
    );
  });

  return serverId;
}

export async function syncWithServer(): Promise<void> {
  await processSyncQueue();
}

export async function hasPendingMutations(): Promise<boolean> {
  const mutations = await getPendingMutations();
  return mutations.length > 0;
}
