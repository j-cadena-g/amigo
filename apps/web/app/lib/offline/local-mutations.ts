import type { OfflineGroceryItem } from "./db";
import type { QueuedMutation } from "./sync-queue";

export type LocalMutationContext = {
  householdId: string;
  userId: string;
  now?: number;
};

type QueuedOp = Pick<QueuedMutation, "operation" | "entityId" | "payload">;

function nowMs(ctx: LocalMutationContext): number {
  return ctx.now ?? Date.now();
}

export function buildOfflineItemForAdd(
  ctx: LocalMutationContext,
  entityId: string,
  payload: Record<string, unknown>
): OfflineGroceryItem {
  const t = nowMs(ctx);
  const name = typeof payload.name === "string" ? payload.name : "";
  const tagIds = Array.isArray(payload.tagIds)
    ? payload.tagIds.filter((id): id is string => typeof id === "string")
    : [];

  return {
    id: entityId,
    householdId: ctx.householdId,
    createdByUserId: ctx.userId,
    createdByUserDisplayName: null,
    itemName: name,
    category: null,
    isPurchased: false,
    purchasedAt: null,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    tagIds,
    _localVersion: 1,
    _serverVersion: 0,
    _syncStatus: "pending",
  };
}

export function applyQueuedMutationToItems(
  items: OfflineGroceryItem[],
  mutation: QueuedOp,
  ctx: LocalMutationContext
): OfflineGroceryItem[] {
  const t = nowMs(ctx);

  switch (mutation.operation) {
    case "add": {
      const without = items.filter((i) => i.id !== mutation.entityId);
      return [
        buildOfflineItemForAdd(ctx, mutation.entityId, mutation.payload),
        ...without,
      ];
    }
    case "toggle":
      return items.map((item) => {
        if (item.id !== mutation.entityId) return item;
        const isPurchased = !item.isPurchased;
        return {
          ...item,
          isPurchased,
          purchasedAt: isPurchased ? t : null,
          updatedAt: t,
          _localVersion: item._localVersion + 1,
          _syncStatus: "pending" as const,
        };
      });
    case "delete":
      return items.map((item) => {
        if (item.id !== mutation.entityId) return item;
        return {
          ...item,
          deletedAt: t,
          updatedAt: t,
          _localVersion: item._localVersion + 1,
          _syncStatus: "pending" as const,
        };
      });
    case "updateTags":
      return items.map((item) => {
        if (item.id !== mutation.entityId) return item;
        const tagIds = Array.isArray(mutation.payload.tagIds)
          ? mutation.payload.tagIds.filter(
              (id): id is string => typeof id === "string"
            )
          : (item.tagIds ?? []);
        return {
          ...item,
          tagIds,
          updatedAt: t,
          _localVersion: item._localVersion + 1,
          _syncStatus: "pending" as const,
        };
      });
    default: {
      const _exhaustive: never = mutation.operation;
      void _exhaustive;
      return items;
    }
  }
}
