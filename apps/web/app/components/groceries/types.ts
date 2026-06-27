import type { GroceryItem, GroceryTag, GroceryItemTag } from "@amigo/db";

export type GroceryItemWithTags = GroceryItem & {
  groceryItemTags: (GroceryItemTag & { groceryTag: GroceryTag })[];
  createdByUser: { id: string; name: string | null; email: string } | null;
};

export type OptimisticAction =
  | { type: "add"; item: GroceryItemWithTags }
  | { type: "toggle"; id: string }
  | { type: "toggle_with_date"; id: string; purchasedAt: Date }
  | { type: "delete"; id: string }
  | { type: "update_tags"; id: string; tagIds: string[]; allTags: GroceryTag[] }
  | { type: "edit_name"; id: string; name: string }
  | { type: "update_purchase_date"; id: string; purchasedAt: Date };
