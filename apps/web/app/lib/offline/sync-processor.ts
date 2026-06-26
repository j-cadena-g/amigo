import { getOfflineDB } from "./db";
import {
  getPendingMutations,
  removeMutation,
  markMutationFailed,
  setLastSyncTimestamp,
} from "./sync-queue";

const MAX_RETRIES = 5;
const SYNC_BATCH_SIZE = 10;

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

export async function processSyncQueue(): Promise<{
  processed: number;
  failed: number;
}> {
  const mutations = await getPendingMutations();
  if (mutations.length === 0) return { processed: 0, failed: 0 };

  // Filter out mutations that have exceeded retry limit
  const viable = mutations.filter((m) => m.retryCount < MAX_RETRIES);
  const expired = mutations.filter((m) => m.retryCount >= MAX_RETRIES);

  for (const m of expired) {
    await removeMutation(m.id);
  }

  const batches = chunkArray(viable, SYNC_BATCH_SIZE);
  let totalProcessed = 0;
  let totalFailed = expired.length;

  for (const batch of batches) {
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
        // Server error - mark all in batch as failed
        for (const m of batch) {
          await markMutationFailed(m.id, `Server returned ${response.status}`);
        }
        totalFailed += batch.length;
        continue;
      }

      const result = (await response.json()) as BatchSyncResponse;

      // Process individual results
      for (const r of result.results) {
        if (r.success) {
          // Update local item with server data if returned
          if (r.serverItem) {
            await updateLocalFromServer(r.id, r.serverItem);
          }
          const mutation = batch.find((m) => m.id === r.id);
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
      // Network error - mark all in batch as failed
      const errorMessage =
        error instanceof Error ? error.message : "Network error";
      for (const m of batch) {
        await markMutationFailed(m.id, errorMessage);
      }
      totalFailed += batch.length;
      // Stop processing further batches on network error
      break;
    }
  }

  if (totalProcessed > 0) {
    await setLastSyncTimestamp(Date.now());
  }

  return { processed: totalProcessed, failed: totalFailed };
}

async function updateLocalFromServer(
  mutationId: string,
  serverItem: Record<string, unknown>
): Promise<void> {
  const db = getOfflineDB();

  if (serverItem.id && typeof serverItem.id === "string") {
    const existing = await db.groceryItems.get(serverItem.id);
    if (existing) {
      await db.groceryItems.update(serverItem.id, {
        ...serverItem,
        _localVersion: 0,
        _serverVersion: (serverItem.updatedAt as number) ?? Date.now(),
        _syncStatus: "synced",
      });
    }
  }
}

export async function syncWithServer(): Promise<void> {
  await processSyncQueue();
}

export async function hasPendingMutations(): Promise<boolean> {
  const mutations = await getPendingMutations();
  return mutations.length > 0;
}
