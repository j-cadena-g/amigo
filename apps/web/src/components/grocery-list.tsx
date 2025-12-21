"use client";

import { useOptimistic, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addItem, toggleItem, deleteItem } from "@/actions/groceries";
import type { GroceryItem } from "@amigo/db";

interface GroceryListProps {
  initialItems: GroceryItem[];
  wsUrl: string;
}

type OptimisticAction =
  | { type: "add"; item: GroceryItem }
  | { type: "toggle"; id: string }
  | { type: "delete"; id: string };

function groceryReducer(
  state: GroceryItem[],
  action: OptimisticAction
): GroceryItem[] {
  switch (action.type) {
    case "add":
      return [action.item, ...state];
    case "toggle":
      return state.map((item) =>
        item.id === action.id
          ? { ...item, isPurchased: !item.isPurchased }
          : item
      );
    case "delete":
      return state.filter((item) => item.id !== action.id);
    default:
      return state;
  }
}

export function GroceryList({ initialItems, wsUrl }: GroceryListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newItemName, setNewItemName] = useState("");
  const [optimisticItems, addOptimistic] = useOptimistic(
    initialItems,
    groceryReducer
  );

  // WebSocket connection for real-time updates
  useEffect(() => {
    // Construct full WebSocket URL from current page location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const fullWsUrl = `${protocol}//${window.location.host}${wsUrl}`;
    const ws = new WebSocket(fullWsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type: string;
          householdId: string;
        };

        if (payload.type === "GROCERY_UPDATE") {
          // Refresh the page to get authoritative state
          router.refresh();
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
    };

    return () => {
      ws.close();
    };
  }, [wsUrl, router]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItemName.trim();
    if (!name) return;

    setNewItemName("");

    // Optimistic update with temp ID
    const tempItem: GroceryItem = {
      id: crypto.randomUUID(),
      householdId: "",
      createdByUserId: "",
      itemName: name,
      category: "Uncategorized",
      isPurchased: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    startTransition(async () => {
      addOptimistic({ type: "add", item: tempItem });
      await addItem(name);
    });
  };

  const handleToggleItem = async (id: string) => {
    startTransition(async () => {
      addOptimistic({ type: "toggle", id });
      await toggleItem(id);
    });
  };

  const handleDeleteItem = async (id: string) => {
    startTransition(async () => {
      addOptimistic({ type: "delete", id });
      await deleteItem(id);
    });
  };

  // Group items by category
  const groupedItems = optimisticItems.reduce(
    (acc, item) => {
      const category = item.category ?? "Uncategorized";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, GroceryItem[]>
  );

  const categories = Object.keys(groupedItems).sort();

  return (
    <div className="space-y-6">
      {/* Add Item Form */}
      <form onSubmit={handleAddItem} className="flex gap-2">
        <input
          type="text"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Add an item..."
          className="flex-1 rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending || !newItemName.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {/* Item List by Category */}
      {categories.length === 0 ? (
        <p className="text-center text-gray-500">
          No items yet. Add something to your grocery list!
        </p>
      ) : (
        <div className="space-y-4">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">
                {category}
              </h3>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                {(groupedItems[category] ?? []).map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.isPurchased}
                        onChange={() => handleToggleItem(item.id)}
                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span
                        className={
                          item.isPurchased
                            ? "text-gray-400 line-through"
                            : "text-gray-900"
                        }
                      >
                        {item.itemName}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="text-gray-400 hover:text-red-500"
                      aria-label="Delete item"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
