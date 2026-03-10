import { useOptimistic, useTransition, useCallback, useState } from "react";
import { useRevalidator } from "react-router";
import type { GroceryTag } from "@amigo/db";
import type { GroceryItemWithTags, OptimisticAction } from "./types";
import { useWebSocket } from "@/app/lib/websocket";

function applyOptimisticAction(
  items: GroceryItemWithTags[],
  action: OptimisticAction
): GroceryItemWithTags[] {
  switch (action.type) {
    case "add":
      return [action.item, ...items];

    case "toggle":
      return items.map((item) =>
        item.id === action.id
          ? {
              ...item,
              isPurchased: !item.isPurchased,
              purchasedAt: item.isPurchased ? null : new Date(),
            }
          : item
      );

    case "toggle_with_date":
      return items.map((item) =>
        item.id === action.id
          ? {
              ...item,
              isPurchased: !item.isPurchased,
              purchasedAt: item.isPurchased ? null : action.purchasedAt,
            }
          : item
      );

    case "delete":
      return items.filter((item) => item.id !== action.id);

    case "update_tags":
      return items.map((item) =>
        item.id === action.id
          ? {
              ...item,
              groceryItemTags: action.tagIds.flatMap((tagId) => {
                const existing = item.groceryItemTags.find(
                  (git) => git.groceryTag.id === tagId
                );
                if (existing) return [existing];
                const tag = action.allTags.find((t) => t.id === tagId);
                if (!tag) return [];
                return [{
                  itemId: item.id,
                  tagId,
                  groceryTag: tag,
                } as GroceryItemWithTags["groceryItemTags"][number]];
              }),
            }
          : item
      );

    case "edit_name":
      return items.map((item) =>
        item.id === action.id ? { ...item, itemName: action.name } : item
      );

    case "update_purchase_date":
      return items.map((item) =>
        item.id === action.id
          ? { ...item, purchasedAt: action.purchasedAt }
          : item
      );

    default:
      return items;
  }
}

interface UseGroceryLogicOptions {
  items: GroceryItemWithTags[];
  allTags: GroceryTag[];
}

export function useGroceryLogic({ items, allTags }: UseGroceryLogicOptions) {
  const revalidator = useRevalidator();
  const [isPending, startTransition] = useTransition();
  const [optimisticItems, addOptimisticAction] = useOptimistic(
    items,
    applyOptimisticAction
  );
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [datePickerItemId, setDatePickerItemId] = useState<string | null>(null);

  // WebSocket for real-time updates
  const onMessage = useCallback(
    (data: unknown) => {
      if (
        data &&
        typeof data === "object" &&
        "type" in data &&
        (data as { type: string }).type === "GROCERY_UPDATE"
      ) {
        revalidator.revalidate();
      }
    },
    [revalidator]
  );

  useWebSocket({ onMessage });

  // --- Actions ---

  const addItem = useCallback(
    (name: string, tagIds: string[]) => {
      const tempId = crypto.randomUUID();
      const now = new Date();
      const tempItem: GroceryItemWithTags = {
        id: tempId,
        itemName: name,
        isPurchased: false,
        purchasedAt: null,
        householdId: "",
        createdByUserId: null,
        createdByUserDisplayName: null,
        transferredFromCreatedByUserId: null,
        category: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        groceryItemTags: tagIds.map((tagId) => {
          const tag = allTags.find((t) => t.id === tagId);
          return {
            itemId: tempId,
            tagId,
            groceryTag: tag!,
          } as GroceryItemWithTags["groceryItemTags"][number];
        }),
        createdByUser: null,
      };

      startTransition(async () => {
        addOptimisticAction({ type: "add", item: tempItem });
        await fetch("/api/groceries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, tagIds }),
        });
        revalidator.revalidate();
      });
    },
    [allTags, addOptimisticAction, revalidator]
  );

  const toggleItem = useCallback(
    (id: string) => {
      startTransition(async () => {
        addOptimisticAction({ type: "toggle", id });
        await fetch(`/api/groceries/${id}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        revalidator.revalidate();
      });
    },
    [addOptimisticAction, revalidator]
  );

  const toggleItemWithDate = useCallback(
    (id: string) => {
      setDatePickerItemId(id);
    },
    []
  );

  const confirmToggleWithDate = useCallback(
    (id: string, purchasedAt: Date) => {
      startTransition(async () => {
        addOptimisticAction({ type: "toggle_with_date", id, purchasedAt });
        await fetch(`/api/groceries/${id}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchasedAt: purchasedAt.toISOString() }),
        });
        revalidator.revalidate();
      });
      setDatePickerItemId(null);
    },
    [addOptimisticAction, revalidator]
  );

  const confirmUpdatePurchaseDate = useCallback(
    (id: string, purchasedAt: Date) => {
      startTransition(async () => {
        addOptimisticAction({ type: "update_purchase_date", id, purchasedAt });
        await fetch(`/api/groceries/${id}/purchase-date`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchasedAt: purchasedAt.toISOString() }),
        });
        revalidator.revalidate();
      });
      setDatePickerItemId(null);
    },
    [addOptimisticAction, revalidator]
  );

  const deleteItem = useCallback(
    (id: string) => {
      startTransition(async () => {
        addOptimisticAction({ type: "delete", id });
        await fetch(`/api/groceries/${id}`, { method: "DELETE" });
        revalidator.revalidate();
      });
    },
    [addOptimisticAction, revalidator]
  );

  const updateTags = useCallback(
    (id: string, tagIds: string[]) => {
      startTransition(async () => {
        addOptimisticAction({ type: "update_tags", id, tagIds, allTags });
        await fetch(`/api/groceries/${id}/tags`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagIds }),
        });
        revalidator.revalidate();
      });
    },
    [allTags, addOptimisticAction, revalidator]
  );

  const editName = useCallback(
    (id: string, name: string) => {
      startTransition(async () => {
        addOptimisticAction({ type: "edit_name", id, name });
        await fetch(`/api/groceries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        revalidator.revalidate();
      });
    },
    [addOptimisticAction, revalidator]
  );

  const createTag = useCallback(
    async (name: string, color: string): Promise<GroceryTag | undefined> => {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) return undefined;
      const tag = (await res.json()) as GroceryTag;
      revalidator.revalidate();
      return tag;
    },
    [revalidator]
  );

  const deleteTag = useCallback(
    async (tagId: string): Promise<void> => {
      await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      revalidator.revalidate();
    },
    [revalidator]
  );

  const editTag = useCallback(
    async (tagId: string, name: string, color: string): Promise<void> => {
      await fetch(`/api/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      revalidator.revalidate();
    },
    [revalidator]
  );

  // --- Filtering ---

  const toggleFilterTag = useCallback((tagId: string) => {
    setFilterTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  // --- Derived state ---

  const activeItems = optimisticItems.filter((item) => !item.isPurchased);
  const purchasedItems = optimisticItems.filter((item) => item.isPurchased);

  const filteredActiveItems =
    filterTagIds.length > 0
      ? activeItems.filter((item) =>
          item.groceryItemTags.some((git) =>
            filterTagIds.includes(git.groceryTag.id)
          )
        )
      : activeItems;

  const datePickerItem = datePickerItemId
    ? optimisticItems.find((item) => item.id === datePickerItemId) ?? null
    : null;

  return {
    optimisticItems,
    activeItems: filteredActiveItems,
    purchasedItems,
    isPending,
    filterTagIds,
    datePickerItem,
    datePickerItemId,
    addItem,
    toggleItem,
    toggleItemWithDate,
    confirmToggleWithDate,
    confirmUpdatePurchaseDate,
    deleteItem,
    updateTags,
    editName,
    createTag,
    deleteTag,
    editTag,
    toggleFilterTag,
    setDatePickerItemId,
  };
}
