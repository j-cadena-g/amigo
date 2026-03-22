import { useOptimistic, useTransition, useCallback, useState, useRef, useEffect } from "react";
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

  // Track isPending in a ref so the WebSocket handler always reads the
  // current value — the onMessage closure is captured at connection time
  // by useWebSocket's connectRef, so a plain closure would go stale.
  const isPendingRef = useRef(false);
  useEffect(() => {
    isPendingRef.current = isPending;
  }, [isPending]);

  // WebSocket for real-time updates from other household members.
  // Skip revalidation while a transition is pending — the transition
  // already revalidates on completion, so an extra revalidation from
  // our own broadcast would race and briefly flash stale data.
  const onMessage = useCallback(
    (data: unknown) => {
      if (
        data &&
        typeof data === "object" &&
        "type" in data &&
        (data as { type: string }).type === "GROCERY_UPDATE"
      ) {
        if (!isPendingRef.current) {
          revalidator.revalidate();
        }
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
        const res = await fetch("/api/groceries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, tagIds }),
        });
        if (!res.ok) {
          console.error(`Failed to add grocery item: ${res.status}`);
        }
        revalidator.revalidate();
      });
    },
    [allTags, addOptimisticAction, revalidator]
  );

  const toggleItem = useCallback(
    (id: string) => {
      startTransition(async () => {
        addOptimisticAction({ type: "toggle", id });
        const res = await fetch(`/api/groceries/${id}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          console.error(`Failed to toggle grocery item: ${res.status}`);
        }
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
        const res = await fetch(`/api/groceries/${id}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchasedAt: purchasedAt.toISOString() }),
        });
        if (!res.ok) {
          console.error(`Failed to toggle grocery item with date: ${res.status}`);
        }
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
        const res = await fetch(`/api/groceries/${id}/purchase-date`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchasedAt: purchasedAt.toISOString() }),
        });
        if (!res.ok) {
          console.error(`Failed to update purchase date: ${res.status}`);
        }
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
        const res = await fetch(`/api/groceries/${id}`, { method: "DELETE" });
        if (!res.ok) {
          console.error(`Failed to delete grocery item: ${res.status}`);
        }
        revalidator.revalidate();
      });
    },
    [addOptimisticAction, revalidator]
  );

  const updateTags = useCallback(
    (id: string, tagIds: string[]) => {
      startTransition(async () => {
        addOptimisticAction({ type: "update_tags", id, tagIds, allTags });
        const res = await fetch(`/api/groceries/${id}/tags`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagIds }),
        });
        if (!res.ok) {
          console.error(`Failed to update grocery item tags: ${res.status}`);
        }
        revalidator.revalidate();
      });
    },
    [allTags, addOptimisticAction, revalidator]
  );

  const editName = useCallback(
    (id: string, name: string) => {
      startTransition(async () => {
        addOptimisticAction({ type: "edit_name", id, name });
        const res = await fetch(`/api/groceries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          console.error(`Failed to edit grocery item name: ${res.status}`);
        }
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
