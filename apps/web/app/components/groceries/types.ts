import type { GroceryItem, GroceryTag, GroceryItemTag, GroceryCategorySource } from "@amigo/db";
import type { GroceryCategory } from "@/app/lib/grocery-categories";

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
  | { type: "edit_name"; id: string; name: string; category?: string | null }
  | {
      type: "set_category";
      id: string;
      category: GroceryCategory | null;
      /** Present once the server has answered; those two fields win as-is. */
      server?: { category: string | null; categorySource: GroceryCategorySource };
    }
  | { type: "update_purchase_date"; id: string; purchasedAt: Date };
