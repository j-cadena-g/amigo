"use client";

import { useEffect, useCallback, useTransition, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import {
  getOfflineDB,
  isOfflineSupported,
  type OfflineGroceryItem,
} from "@/lib/offline/db";
import { queueMutation, getPendingCount } from "@/lib/offline/sync-queue";
import { processSyncQueue } from "@/lib/offline/sync-processor";
import { hydrateFromServer, type GroceryItemWithTags, type GroceryTag } from "@/lib/offline/hydration";
import { useOnlineStatus } from "./use-online-status";
import {
  addItem as serverAddItem,
  toggleItem as serverToggleItem,
  deleteItem as serverDeleteItem,
} from "@/actions/groceries";

interface UseOfflineGroceriesOptions {
  initialItems: GroceryItemWithTags[];
  allTags: GroceryTag[];
  householdId: string;
  userId: string;
}

interface UseOfflineGroceriesResult {
  items: GroceryItemWithTags[];
  isOnline: boolean;
  isPending: boolean;
  pendingCount: number;
  isOfflineReady: boolean;
  addItem: (name: string, tagIds: string[]) => Promise<void>;
  toggleItem: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  syncNow: () => Promise<void>;
}

export function useOfflineGroceries({
  initialItems,
  allTags,
  householdId,
  userId,
}: UseOfflineGroceriesOptions): UseOfflineGroceriesResult {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [isPending, startTransition] = useTransition();
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Initialize offline store
  useEffect(() => {
    let mounted = true;

    async function init() {
      const supported = await isOfflineSupported();
      if (!supported || !mounted) return;

      try {
        await hydrateFromServer(initialItems, allTags);
        if (mounted) {
          setIsOfflineReady(true);
          const count = await getPendingCount();
          setPendingCount(count);
        }
      } catch (error) {
        console.error("Failed to initialize offline store:", error);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [initialItems, allTags]);

  // Sync when coming back online
  useEffect(() => {
    if (isOnline && isOfflineReady) {
      processSyncQueue().then(({ processed }) => {
        if (processed > 0) {
          router.refresh();
        }
        getPendingCount().then(setPendingCount);
      });
    }
  }, [isOnline, isOfflineReady, router]);

  // Listen for service worker sync messages
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "TRIGGER_SYNC") {
        processSyncQueue().then(({ processed }) => {
          if (processed > 0) {
            router.refresh();
          }
          getPendingCount().then(setPendingCount);
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [router]);

  // Live query from IndexedDB
  const offlineItems = useLiveQuery(
    async () => {
      if (!isOfflineReady) return null;
      const db = getOfflineDB();
      return db.groceryItems
        .filter((item) => item.deletedAt === null && item.householdId === householdId)
        .toArray();
    },
    [isOfflineReady, householdId],
    null
  );

  // Convert offline items to the expected format with tags
  // Use initialItems for tags since we don't store them in IndexedDB yet
  const items = (offlineItems ?? initialItems).map((item) => {
    // Find the original item with tags
    const original = initialItems.find((i) => i.id === item.id);
    return {
      id: item.id,
      householdId: item.householdId,
      createdByUserId: item.createdByUserId,
      itemName: item.itemName,
      category: item.category,
      isPurchased: item.isPurchased,
      purchasedAt: item.purchasedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      deletedAt: item.deletedAt,
      tags: original?.tags ?? [],
    } as GroceryItemWithTags;
  });

  const addItem = useCallback(
    async (name: string, tagIds: string[]) => {
      const tempId = nanoid();
      const now = new Date();

      const tempItem: OfflineGroceryItem = {
        id: tempId,
        householdId,
        createdByUserId: userId,
        createdByUserDisplayName: null,
        itemName: name,
        category: null,
        isPurchased: false,
        purchasedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        _localVersion: 1,
        _serverVersion: 0,
        _syncStatus: "pending",
      };

      startTransition(async () => {
        if (isOfflineReady) {
          const db = getOfflineDB();
          await db.groceryItems.add(tempItem);

          await queueMutation({
            operation: "add",
            entityType: "groceryItem",
            entityId: tempId,
            payload: { name, tagIds },
          });

          setPendingCount((c) => c + 1);
        }

        // If online, also call server immediately
        if (isOnline) {
          try {
            await serverAddItem(name, undefined, tagIds);
          } catch (error) {
            console.error("Server add failed, will retry:", error);
          }
        }
      });
    },
    [householdId, userId, isOfflineReady, isOnline]
  );

  const toggleItem = useCallback(
    async (id: string) => {
      startTransition(async () => {
        if (isOfflineReady) {
          const db = getOfflineDB();
          const item = await db.groceryItems.get(id);
          if (item) {
            const now = new Date();
            await db.groceryItems.update(id, {
              isPurchased: !item.isPurchased,
              purchasedAt: item.isPurchased ? null : now,
              updatedAt: now,
              _localVersion: item._localVersion + 1,
              _syncStatus: "pending",
            });

            await queueMutation({
              operation: "toggle",
              entityType: "groceryItem",
              entityId: id,
              payload: {},
            });

            setPendingCount((c) => c + 1);
          }
        }

        // If online, also call server immediately
        if (isOnline) {
          try {
            await serverToggleItem(id);
          } catch (error) {
            console.error("Server toggle failed, will retry:", error);
          }
        }
      });
    },
    [isOfflineReady, isOnline]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      startTransition(async () => {
        if (isOfflineReady) {
          const db = getOfflineDB();
          const item = await db.groceryItems.get(id);
          if (item) {
            const now = new Date();
            await db.groceryItems.update(id, {
              deletedAt: now,
              updatedAt: now,
              _syncStatus: "pending",
            });

            await queueMutation({
              operation: "delete",
              entityType: "groceryItem",
              entityId: id,
              payload: {},
            });

            setPendingCount((c) => c + 1);
          }
        }

        // If online, also call server immediately
        if (isOnline) {
          try {
            await serverDeleteItem(id);
          } catch (error) {
            console.error("Server delete failed, will retry:", error);
          }
        }
      });
    },
    [isOfflineReady, isOnline]
  );

  const syncNow = useCallback(async () => {
    if (!isOnline) return;

    const { processed } = await processSyncQueue();
    if (processed > 0) {
      router.refresh();
    }
    const count = await getPendingCount();
    setPendingCount(count);
  }, [isOnline, router]);

  return {
    items,
    isOnline,
    isPending,
    pendingCount,
    isOfflineReady,
    addItem,
    toggleItem,
    deleteItem,
    syncNow,
  };
}
