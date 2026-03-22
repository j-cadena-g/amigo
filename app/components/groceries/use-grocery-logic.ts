import { useTransition, useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useRevalidator } from "react-router";
import type { GroceryTag } from "@amigo/db";
import type { GroceryItemWithTags, OptimisticAction } from "./types";
import {
  applyOptimisticMutations,
  clearSettledMutations,
  createOptimisticMutation,
  markMutationSettled,
  type OptimisticMutation,
} from "./optimistic-state";
import { useWebSocket } from "@/app/lib/websocket";

interface UseGroceryLogicOptions {
  items: GroceryItemWithTags[];
  allTags: GroceryTag[];
}

export function useGroceryLogic({ items, allTags }: UseGroceryLogicOptions) {
  const revalidator = useRevalidator();
  const [isPending, startTransition] = useTransition();
  const [optimisticMutations, setOptimisticMutations] = useState<
    OptimisticMutation[]
  >([]);
  const optimisticItems = useMemo(
    () => applyOptimisticMutations(items, optimisticMutations),
    [items, optimisticMutations]
  );
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [datePickerItemId, setDatePickerItemId] = useState<string | null>(null);

  useEffect(() => {
    setOptimisticMutations((currentMutations) =>
      clearSettledMutations(currentMutations)
    );
  }, [items]);

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

  // --- Helpers ---

  // Runs a fetch mutation with error handling, always revalidating afterward
  // so optimistic state reconciles even on network failure.
  const runMutation = useCallback(
    async (
      label: string,
      request: () => Promise<Response>,
      mutationId?: string
    ) => {
      try {
        const res = await request();
        if (!res.ok) {
          console.error(`${label} failed: ${res.status}`);
        }
      } catch (error) {
        console.error(`${label} failed: network error`, error);
      } finally {
        if (mutationId) {
          setOptimisticMutations((currentMutations) =>
            markMutationSettled(currentMutations, mutationId)
          );
        }
        revalidator.revalidate();
      }
    },
    [revalidator]
  );

  const queueOptimisticAction = useCallback((action: OptimisticAction) => {
    const mutation = createOptimisticMutation(action);
    setOptimisticMutations((currentMutations) => [
      ...currentMutations,
      mutation,
    ]);
    return mutation.id;
  }, []);

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
        const mutationId = queueOptimisticAction({ type: "add", item: tempItem });
        await runMutation("Add grocery item", () =>
          fetch("/api/groceries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, tagIds }),
          }),
          mutationId
        );
      });
    },
    [allTags, queueOptimisticAction, runMutation]
  );

  const toggleItem = useCallback(
    (id: string) => {
      startTransition(async () => {
        const mutationId = queueOptimisticAction({ type: "toggle", id });
        await runMutation("Toggle grocery item", () =>
          fetch(`/api/groceries/${id}/toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }),
          mutationId
        );
      });
    },
    [queueOptimisticAction, runMutation]
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
        const mutationId = queueOptimisticAction({
          type: "toggle_with_date",
          id,
          purchasedAt,
        });
        await runMutation("Toggle grocery item with date", () =>
          fetch(`/api/groceries/${id}/toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ purchasedAt: purchasedAt.toISOString() }),
          }),
          mutationId
        );
      });
      setDatePickerItemId(null);
    },
    [queueOptimisticAction, runMutation]
  );

  const confirmUpdatePurchaseDate = useCallback(
    (id: string, purchasedAt: Date) => {
      startTransition(async () => {
        const mutationId = queueOptimisticAction({
          type: "update_purchase_date",
          id,
          purchasedAt,
        });
        await runMutation("Update purchase date", () =>
          fetch(`/api/groceries/${id}/purchase-date`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ purchasedAt: purchasedAt.toISOString() }),
          }),
          mutationId
        );
      });
      setDatePickerItemId(null);
    },
    [queueOptimisticAction, runMutation]
  );

  const deleteItem = useCallback(
    (id: string) => {
      startTransition(async () => {
        const mutationId = queueOptimisticAction({ type: "delete", id });
        await runMutation(
          "Delete grocery item",
          () => fetch(`/api/groceries/${id}`, { method: "DELETE" }),
          mutationId
        );
      });
    },
    [queueOptimisticAction, runMutation]
  );

  const updateTags = useCallback(
    (id: string, tagIds: string[]) => {
      startTransition(async () => {
        const mutationId = queueOptimisticAction({
          type: "update_tags",
          id,
          tagIds,
          allTags,
        });
        await runMutation("Update grocery item tags", () =>
          fetch(`/api/groceries/${id}/tags`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagIds }),
          }),
          mutationId
        );
      });
    },
    [allTags, queueOptimisticAction, runMutation]
  );

  const editName = useCallback(
    (id: string, name: string) => {
      startTransition(async () => {
        const mutationId = queueOptimisticAction({ type: "edit_name", id, name });
        await runMutation("Edit grocery item name", () =>
          fetch(`/api/groceries/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          }),
          mutationId
        );
      });
    },
    [queueOptimisticAction, runMutation]
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
