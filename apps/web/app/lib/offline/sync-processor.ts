import { getOfflineDB, type SyncQueueEntry } from "./db";
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

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
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
    await removeMutation(m.id);
  }

  const batches = chunkArray(viable, SYNC_BATCH_SIZE);
  let totalProcessed = 0;
  let totalFailed = 0;
  const discarded = expired.length;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]!;
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
        continue;
      }

      const result = (await response.json()) as BatchSyncResponse;

      for (const r of result.results) {
        if (r.success) {
          const mutation = batch.find((m) => m.id === r.id);
          if (mutation && r.serverItem) {
            const serverId = await updateLocalFromServer(mutation, r.serverItem);
            if (
              mutation.operation === "add" &&
              serverId &&
              serverId !== mutation.entityId
            ) {
              for (let i = batchIndex + 1; i < batches.length; i++) {
                batches[i] = remapEntityIdInMutations(
                  batches[i]!,
                  mutation.entityId,
                  serverId
                );
              }
            }
          }
          if (mutation) {
            await removeMutation(mutation.id);
          }
          totalProcessed++;
        } else {
          const mutation = batch.find((m) => m.id === r.id);
          if (mutation) {
            await markMutationFailed(mutation.id, r.error ?? "Unknown error");
          }
          totalFailed++;
        }
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

async function updateLocalFromServer(
  mutation: SyncQueueEntry,
  serverItem: Record<string, unknown>
): Promise<string | null> {
  const db = getOfflineDB();
  const serverId =
    typeof serverItem.id === "string" ? serverItem.id : null;
  if (!serverId) return null;

  const now = Date.now();
  const tempId = mutation.entityId;

  await db.transaction("rw", db.groceryItems, db.syncQueue, async () => {
    if (mutation.operation === "add" && tempId !== serverId) {
      const temp = await db.groceryItems.get(tempId);
      if (temp) {
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
    const tagIds = Array.isArray(serverItem.tagIds)
      ? serverItem.tagIds.filter((id): id is string => typeof id === "string")
      : existing?.tagIds;

    await db.groceryItems.put({
      id: serverId,
      householdId:
        typeof serverItem.householdId === "string"
          ? serverItem.householdId
          : (existing?.householdId ?? ""),
      createdByUserId:
        typeof serverItem.createdByUserId === "string"
          ? serverItem.createdByUserId
          : (existing?.createdByUserId ?? null),
      createdByUserDisplayName:
        typeof serverItem.createdByUserDisplayName === "string"
          ? serverItem.createdByUserDisplayName
          : (existing?.createdByUserDisplayName ?? null),
      itemName:
        typeof serverItem.itemName === "string"
          ? serverItem.itemName
          : (existing?.itemName ?? ""),
      category:
        typeof serverItem.category === "string"
          ? serverItem.category
          : (existing?.category ?? null),
      isPurchased: Boolean(
        serverItem.isPurchased ?? existing?.isPurchased ?? false
      ),
      purchasedAt:
        serverItem.purchasedAt == null
          ? null
          : coerceTimestampMs(serverItem.purchasedAt, now),
      createdAt: coerceTimestampMs(
        serverItem.createdAt,
        existing?.createdAt ?? now
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
    });
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
