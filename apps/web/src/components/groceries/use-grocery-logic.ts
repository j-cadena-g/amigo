"use client";

import { useOptimistic, useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { GroceryTag } from "@amigo/db";
import type { GroceryItemWithTags, OptimisticAction } from "./types";
import { addItem, toggleItem, deleteItem, updateItemTags, updateItem, updatePurchaseDate } from "@/actions/groceries";
import { createTag, deleteTag, updateTag } from "@/actions/tags";
import { useWebSocket } from "@/hooks/use-websocket";

function groceryReducer(
  state: GroceryItemWithTags[],
  action: OptimisticAction
): GroceryItemWithTags[] {
  switch (action.type) {
    case "add":
      return [action.item, ...state];
    case "toggle":
      return state.map((item) =>
        item.id === action.id
          ? {
              ...item,
              isPurchased: !item.isPurchased,
              purchasedAt: item.isPurchased ? null : new Date(),
            }
          : item
      );
    case "toggle_with_date":
      return state.map((item) =>
        item.id === action.id
          ? {
              ...item,
              isPurchased: true,
              purchasedAt: action.purchasedAt,
            }
          : item
      );
    case "update_purchase_date":
      return state.map((item) =>
        item.id === action.id
          ? {
              ...item,
              purchasedAt: action.purchasedAt,
            }
          : item
      );
    case "delete":
      return state.filter((item) => item.id !== action.id);
    case "update_tags":
      return state.map((item) =>
        item.id === action.id
          ? {
              ...item,
              groceryItemTags: action.tagIds.map((tagId) => {
                const tag = action.allTags.find((t) => t.id === tagId);
                return {
                  itemId: item.id,
                  tagId,
                  groceryTag: tag || {
                    id: tagId,
                    householdId: "",
                    name: "...",
                    color: "gray",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                };
              }),
            }
          : item
      );
    case "edit_name":
      return state.map((item) =>
        item.id === action.id
          ? { ...item, itemName: action.name, updatedAt: new Date() }
          : item
      );
    default:
      return state;
  }
}

interface UseGroceryLogicOptions {
  initialItems: GroceryItemWithTags[];
  initialTags: GroceryTag[];
  wsUrl: string;
  userId: string;
}

export function useGroceryLogic({
  initialItems,
  initialTags,
  wsUrl,
  userId,
}: UseGroceryLogicOptions) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [allTags, setAllTags] = useState(initialTags);

  const [optimisticItems, addOptimistic] = useOptimistic(
    initialItems,
    groceryReducer
  );

  // WebSocket message handler
  const handleWebSocketMessage = useCallback(
    (data: unknown) => {
      const payload = data as { type: string; householdId: string };
      if (payload.type === "GROCERY_UPDATE") {
        // Refresh to get authoritative state
        router.refresh();
      }
    },
    [router]
  );

  // WebSocket connection with auto-reconnect
  useWebSocket({
    url: wsUrl,
    onMessage: handleWebSocketMessage,
  });

  // Sync allTags with server state on refresh
  useEffect(() => {
    setAllTags(initialTags);
  }, [initialTags]);

  // Tag operations
  const handleCreateTag = useCallback(async (name: string, color: string) => {
    const newTag = await createTag(name, color);
    if (newTag) {
      setAllTags((prev) => [...prev, newTag]);
    }
    return newTag;
  }, []);

  const handleDeleteTag = useCallback((tagId: string) => {
    setAllTags((prev) => prev.filter((t) => t.id !== tagId));
    startTransition(async () => {
      await deleteTag(tagId);
    });
  }, []);

  const handleEditTag = useCallback(async (tagId: string, name: string, color: string) => {
    setAllTags((prev) =>
      prev.map((t) =>
        t.id === tagId
          ? { ...t, name, color, updatedAt: new Date() }
          : t
      )
    );
    await updateTag(tagId, name, color);
  }, []);

  // Item operations
  const handleAddItem = useCallback(
    (name: string, tagIds: string[]) => {
      const tempItem: GroceryItemWithTags = {
        id: crypto.randomUUID(),
        householdId: "",
        createdByUserId: userId,
        createdByUserDisplayName: null,
        transferredFromCreatedByUserId: null,
        itemName: name,
        category: "Uncategorized",
        isPurchased: false,
        purchasedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        groceryItemTags: tagIds.map((tagId) => {
          const tag = allTags.find((t) => t.id === tagId);
          return {
            itemId: "",
            tagId,
            groceryTag: tag || {
              id: tagId,
              householdId: "",
              name: "...",
              color: "gray",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          };
        }),
        createdByUser: null,
      };

      startTransition(async () => {
        addOptimistic({ type: "add", item: tempItem });
        await addItem(name, undefined, tagIds);
      });
    },
    [allTags, userId, addOptimistic]
  );

  const handleToggleItem = useCallback(
    (id: string) => {
      startTransition(async () => {
        addOptimistic({ type: "toggle", id });
        await toggleItem(id);
      });
    },
    [addOptimistic]
  );

  const handleToggleItemWithDate = useCallback(
    (id: string, purchasedAt: Date) => {
      startTransition(async () => {
        addOptimistic({ type: "toggle_with_date", id, purchasedAt });
        await toggleItem(id, purchasedAt);
      });
    },
    [addOptimistic]
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      startTransition(async () => {
        addOptimistic({ type: "delete", id });
        await deleteItem(id);
      });
    },
    [addOptimistic]
  );

  const handleUpdateItemTags = useCallback(
    (itemId: string, tagIds: string[]) => {
      startTransition(async () => {
        addOptimistic({ type: "update_tags", id: itemId, tagIds, allTags });
        await updateItemTags(itemId, tagIds);
      });
    },
    [allTags, addOptimistic]
  );

  const handleEditItemName = useCallback(
    (id: string, name: string) => {
      startTransition(async () => {
        addOptimistic({ type: "edit_name", id, name });
        await updateItem(id, name);
      });
    },
    [addOptimistic]
  );

  const handleUpdatePurchaseDate = useCallback(
    (id: string, purchasedAt: Date) => {
      startTransition(async () => {
        addOptimistic({ type: "update_purchase_date", id, purchasedAt });
        await updatePurchaseDate(id, purchasedAt);
      });
    },
    [addOptimistic]
  );

  // Split items into active and history (purchased)
  const activeItems = optimisticItems.filter((item) => !item.isPurchased);
  const historyItems = optimisticItems.filter((item) => item.isPurchased);

  return {
    isPending,
    allTags,
    activeItems,
    historyItems,
    // Tag operations
    handleCreateTag,
    handleDeleteTag,
    handleEditTag,
    // Item operations
    handleAddItem,
    handleToggleItem,
    handleToggleItemWithDate,
    handleDeleteItem,
    handleUpdateItemTags,
    handleEditItemName,
    handleUpdatePurchaseDate,
  };
}
