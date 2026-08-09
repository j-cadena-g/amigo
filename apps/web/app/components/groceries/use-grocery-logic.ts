import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import type { GroceryTag } from "@amigo/db";
import type { GroceryItemWithTags, OptimisticAction } from "./types";
import {
  applyOptimisticAction,
  applyOptimisticMutations,
  createOptimisticMutation,
  type OptimisticMutation,
} from "./optimistic-state";
import { useHouseholdRealtime } from "@/app/components/realtime/household-realtime-provider";
import { useToast } from "@/app/components/toast-provider";
import type { QueuedMutation } from "@/app/lib/offline/sync-queue";
import { readApiErrorMessage } from "@/app/lib/api-error";

interface UseGroceryLogicOptions {
  items: GroceryItemWithTags[];
  allTags: GroceryTag[];
  userId: string;
}

// Shape of a grocery item as serialized by `Response.json` (dates become ISO strings).
interface SerializedGroceryItem {
  id: string;
  householdId: string;
  createdByUserId: string | null;
  createdByUserDisplayName: string | null;
  transferredFromCreatedByUserId: string | null;
  itemName: string;
  category: string | null;
  isPurchased: boolean;
  purchasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Operations the offline sync queue (`/api/sync`) understands. Other actions
// (renames, explicit purchase dates) require a live connection.
function toQueuedMutation(action: OptimisticAction): QueuedMutation | null {
  switch (action.type) {
    case "add":
      return {
        operation: "add",
        entityType: "groceryItem",
        entityId: action.item.id,
        payload: {
          name: action.item.itemName,
          tagIds: action.item.groceryItemTags.map((git) => git.groceryTag.id),
        },
      };
    case "toggle":
      return {
        operation: "toggle",
        entityType: "groceryItem",
        entityId: action.id,
        payload: {},
      };
    case "delete":
      return {
        operation: "delete",
        entityType: "groceryItem",
        entityId: action.id,
        payload: {},
      };
    case "update_tags":
      return {
        operation: "updateTags",
        entityType: "groceryItem",
        entityId: action.id,
        payload: { tagIds: action.tagIds },
      };
    default:
      return null;
  }
}

function buildItemFromServer(
  tempItem: GroceryItemWithTags,
  raw: SerializedGroceryItem
): GroceryItemWithTags {
  return {
    id: raw.id,
    householdId: raw.householdId,
    createdByUserId: raw.createdByUserId,
    createdByUserDisplayName: raw.createdByUserDisplayName,
    transferredFromCreatedByUserId: raw.transferredFromCreatedByUserId,
    itemName: raw.itemName,
    category: raw.category,
    isPurchased: raw.isPurchased,
    purchasedAt: raw.purchasedAt ? new Date(raw.purchasedAt) : null,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    deletedAt: raw.deletedAt ? new Date(raw.deletedAt) : null,
    // Tags aren't returned by the create endpoint, so carry over the
    // optimistic selection, re-pointed at the real server id.
    groceryItemTags: tempItem.groceryItemTags.map((git) => ({
      ...git,
      itemId: raw.id,
    })),
    createdByUser: tempItem.createdByUser,
  };
}

export function useGroceryLogic({
  items,
  allTags,
  userId,
}: UseGroceryLogicOptions) {
  const revalidator = useRevalidator();
  const toast = useToast();

  // Local mirror of the loader data. Successful mutations fold their result in
  // here directly so we don't pay a full-list refetch round-trip per tap; fresh
  // loader data (navigation / WebSocket revalidation) replaces it wholesale.
  const [baseItems, setBaseItems] = useState(items);
  useEffect(() => {
    setBaseItems(items);
  }, [items]);

  // In-flight mutations rendered as an overlay on top of `baseItems`.
  const [optimisticMutations, setOptimisticMutations] = useState<
    OptimisticMutation[]
  >([]);
  const optimisticItems = useMemo(
    () => applyOptimisticMutations(baseItems, optimisticMutations),
    [baseItems, optimisticMutations]
  );

  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [datePickerItemId, setDatePickerItemId] = useState<string | null>(null);

  const isPending = optimisticMutations.length > 0;

  // The WebSocket onMessage closure is captured at connection time, so read
  // pending state through a ref to avoid going stale.
  const isPendingRef = useRef(false);
  useEffect(() => {
    isPendingRef.current = isPending;
  }, [isPending]);

  // Skip revalidation while our own mutations are in flight — we reconcile
  // those locally, and an extra revalidation would race with the overlay.
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

  useHouseholdRealtime(onMessage);

  // Replay any mutations that were queued while offline once connectivity
  // returns (browser `online` event or the service worker's background sync).
  useEffect(() => {
    let cancelled = false;

    async function flush() {
      try {
        const { processSyncQueue } = await import(
          "@/app/lib/offline/sync-processor"
        );
        const result = await processSyncQueue();
        if (cancelled) return;

        if (result.processed > 0) {
          revalidator.revalidate();
          toast(
            `Synced ${result.processed} offline change${
              result.processed === 1 ? "" : "s"
            }`,
            { variant: "success" }
          );
        }

        if (result.discarded > 0) {
          toast(
            `${result.discarded} offline change${
              result.discarded === 1 ? "" : "s"
            } could not sync and ${
              result.discarded === 1 ? "was" : "were"
            } discarded — please re-apply ${
              result.discarded === 1 ? "it" : "them"
            }`,
            { variant: "error", duration: 8000 }
          );
          revalidator.revalidate();
        }
      } catch {
        // Leave the queue intact; we'll retry on the next online/sync event.
      }
    }

    function handleOnline() {
      void flush();
    }
    function handleSwMessage(event: MessageEvent) {
      const data = event.data as { type?: string } | null;
      if (data?.type === "TRIGGER_SYNC") void flush();
    }

    window.addEventListener("online", handleOnline);
    const sw =
      typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    sw?.addEventListener("message", handleSwMessage);

    if (typeof navigator === "undefined" || navigator.onLine) {
      void flush();
    }

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      sw?.removeEventListener("message", handleSwMessage);
    };
  }, [revalidator, toast]);

  // --- Core mutation runner ---
  //
  // 1. Apply the optimistic overlay immediately (urgent update → instant paint).
  // 2. Fire the request in the background.
  // 3. On success: fold the change into base state and drop the overlay.
  //    On server rejection: drop the overlay (revert) + surface a toast.
  //    On network failure: queue for later sync (if supported) and keep the
  //    change, otherwise revert with a toast.
  const runAction = useCallback(
    (
      action: OptimisticAction,
      label: string,
      request: () => Promise<Response>
    ) => {
      const mutation = createOptimisticMutation(action);
      setOptimisticMutations((prev) => [...prev, mutation]);
      const dropOverlay = () =>
        setOptimisticMutations((prev) =>
          prev.filter((m) => m.id !== mutation.id)
        );

      void (async () => {
        try {
          const res = await request();

          if (res.ok) {
            if (action.type === "add") {
              const raw = (await res.json()) as SerializedGroceryItem;
              const realItem = buildItemFromServer(action.item, raw);
              setBaseItems((prev) => [realItem, ...prev]);
            } else {
              setBaseItems((prev) => applyOptimisticAction(prev, action));
            }
            dropOverlay();
            return;
          }

          dropOverlay();
          if (res.status === 429) {
            toast("You're doing that a bit fast — give it a second", {
              variant: "error",
            });
            return;
          }
          const message = await readApiErrorMessage(res);
          toast(message ?? `${label} failed`, { variant: "error" });
        } catch {
          // Network failure (likely offline). Queue supported operations so
          // they replay on reconnect, and keep the optimistic change visible.
          const queued = toQueuedMutation(action);
          if (queued) {
            try {
              const { queueMutation } = await import(
                "@/app/lib/offline/sync-queue"
              );
              await queueMutation(queued);
              setBaseItems((prev) => applyOptimisticAction(prev, action));
              dropOverlay();
              toast("Saved offline — will sync when you're back online");
              return;
            } catch {
              // Couldn't queue; fall through to revert.
            }
          }
          dropOverlay();
          toast(`${label} failed — check your connection`, { variant: "error" });
        }
      })();
    },
    [toast]
  );

  // --- Item actions ---

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
        createdByUserId: userId,
        createdByUserDisplayName: null,
        transferredFromCreatedByUserId: null,
        category: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        groceryItemTags: tagIds.flatMap((tagId) => {
          const tag = allTags.find((t) => t.id === tagId);
          if (!tag) return [];
          return [
            {
              itemId: tempId,
              tagId,
              groceryTag: tag,
            } as GroceryItemWithTags["groceryItemTags"][number],
          ];
        }),
        createdByUser: null,
      };

      runAction({ type: "add", item: tempItem }, "Add item", () =>
        fetch("/api/groceries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, tagIds }),
        })
      );
    },
    [allTags, userId, runAction]
  );

  const toggleItem = useCallback(
    (id: string) => {
      runAction({ type: "toggle", id }, "Update item", () =>
        fetch(`/api/groceries/${id}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );
    },
    [runAction]
  );

  const toggleItemWithDate = useCallback((id: string) => {
    setDatePickerItemId(id);
  }, []);

  const confirmToggleWithDate = useCallback(
    (id: string, purchasedAt: Date) => {
      runAction({ type: "toggle_with_date", id, purchasedAt }, "Update item", () =>
        fetch(`/api/groceries/${id}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchasedAt: purchasedAt.toISOString() }),
        })
      );
      setDatePickerItemId(null);
    },
    [runAction]
  );

  const confirmUpdatePurchaseDate = useCallback(
    (id: string, purchasedAt: Date) => {
      runAction(
        { type: "update_purchase_date", id, purchasedAt },
        "Update purchase date",
        () =>
          fetch(`/api/groceries/${id}/purchase-date`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ purchasedAt: purchasedAt.toISOString() }),
          })
      );
      setDatePickerItemId(null);
    },
    [runAction]
  );

  const deleteItem = useCallback(
    (id: string) => {
      runAction({ type: "delete", id }, "Delete item", () =>
        fetch(`/api/groceries/${id}`, { method: "DELETE" })
      );
    },
    [runAction]
  );

  const updateTags = useCallback(
    (id: string, tagIds: string[]) => {
      runAction(
        { type: "update_tags", id, tagIds, allTags },
        "Update tags",
        () =>
          fetch(`/api/groceries/${id}/tags`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagIds }),
          })
      );
    },
    [allTags, runAction]
  );

  const editName = useCallback(
    (id: string, name: string) => {
      runAction({ type: "edit_name", id, name }, "Rename item", () =>
        fetch(`/api/groceries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        })
      );
    },
    [runAction]
  );

  // --- Tag actions (low frequency; revalidate to refresh the shared list) ---

  const createTag = useCallback(
    async (name: string, color: string): Promise<GroceryTag | undefined> => {
      try {
        const res = await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color }),
        });
        if (!res.ok) {
          toast("Couldn't create tag", { variant: "error" });
          return undefined;
        }
        const tag = (await res.json()) as GroceryTag;
        revalidator.revalidate();
        return tag;
      } catch {
        toast("Couldn't create tag — check your connection", {
          variant: "error",
        });
        return undefined;
      }
    },
    [revalidator, toast]
  );

  const deleteTag = useCallback(
    async (tagId: string): Promise<void> => {
      try {
        const res = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
        if (!res.ok) {
          toast("Couldn't delete tag", { variant: "error" });
          return;
        }
        revalidator.revalidate();
      } catch {
        toast("Couldn't delete tag — check your connection", {
          variant: "error",
        });
      }
    },
    [revalidator, toast]
  );

  const editTag = useCallback(
    async (tagId: string, name: string, color: string): Promise<void> => {
      try {
        const res = await fetch(`/api/tags/${tagId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color }),
        });
        if (!res.ok) {
          toast("Couldn't update tag", { variant: "error" });
          return;
        }
        revalidator.revalidate();
      } catch {
        toast("Couldn't update tag — check your connection", {
          variant: "error",
        });
      }
    },
    [revalidator, toast]
  );

  // --- Filtering ---

  const toggleFilterTag = useCallback((tagId: string) => {
    setFilterTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  // --- Derived state ---

  const matchesFilter = useCallback(
    (item: GroceryItemWithTags) =>
      filterTagIds.length === 0 ||
      item.groceryItemTags.some((git) =>
        filterTagIds.includes(git.groceryTag.id)
      ),
    [filterTagIds]
  );

  const activeItems = optimisticItems.filter(
    (item) => !item.isPurchased && matchesFilter(item)
  );
  const purchasedItems = optimisticItems.filter(
    (item) => item.isPurchased && matchesFilter(item)
  );

  const datePickerItem = datePickerItemId
    ? optimisticItems.find((item) => item.id === datePickerItemId) ?? null
    : null;

  return {
    optimisticItems,
    activeItems,
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
