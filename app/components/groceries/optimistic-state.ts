import type { GroceryItemWithTags, OptimisticAction } from "./types";

export interface OptimisticMutation {
  id: string;
  action: OptimisticAction;
  status: "pending" | "settled";
}

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
                const tag = action.allTags.find((candidate) => candidate.id === tagId);
                if (!tag) return [];
                return [
                  {
                    itemId: item.id,
                    tagId,
                    groceryTag: tag,
                  } as GroceryItemWithTags["groceryItemTags"][number],
                ];
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

export function createOptimisticMutation(
  action: OptimisticAction
): OptimisticMutation {
  return {
    id: crypto.randomUUID(),
    action,
    status: "pending",
  };
}

export function markMutationSettled(
  mutations: OptimisticMutation[],
  mutationId: string
): OptimisticMutation[] {
  return mutations.map((mutation) =>
    mutation.id === mutationId
      ? { ...mutation, status: "settled" }
      : mutation
  );
}

export function clearSettledMutations(
  mutations: OptimisticMutation[]
): OptimisticMutation[] {
  return mutations.filter((mutation) => mutation.status !== "settled");
}

export function applyOptimisticMutations(
  items: GroceryItemWithTags[],
  mutations: OptimisticMutation[]
): GroceryItemWithTags[] {
  return mutations.reduce(
    (currentItems, mutation) => applyOptimisticAction(currentItems, mutation.action),
    items
  );
}
