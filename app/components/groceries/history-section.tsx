import { useState, useMemo } from "react";
import type { GroceryItemWithTags } from "./types";
import { formatHistoryDate } from "./constants";
import { TagBadge } from "./tag-badge";
import { ChevronDownIcon, ChevronRightIcon, TrashIcon } from "./icons";

interface HistorySectionProps {
  items: GroceryItemWithTags[];
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdatePurchaseDate: (id: string) => void;
}

interface DateGroup {
  label: string;
  sortKey: number;
  items: GroceryItemWithTags[];
}

export function HistorySection({
  items,
  onDelete,
  onToggle,
  onUpdatePurchaseDate,
}: HistorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const groups = useMemo(() => {
    const groupMap = new Map<string, DateGroup>();

    for (const item of items) {
      const purchasedAt = item.purchasedAt ? new Date(item.purchasedAt) : new Date();
      const label = formatHistoryDate(purchasedAt);
      const dateOnly = new Date(
        purchasedAt.getFullYear(),
        purchasedAt.getMonth(),
        purchasedAt.getDate()
      );
      const sortKey = dateOnly.getTime();

      const existing = groupMap.get(label);
      if (existing) {
        existing.items.push(item);
      } else {
        groupMap.set(label, { label, sortKey, items: [item] });
      }
    }

    return Array.from(groupMap.values()).sort((a, b) => b.sortKey - a.sortKey);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
      >
        {isExpanded ? (
          <ChevronDownIcon className="h-4 w-4" />
        ) : (
          <ChevronRightIcon className="h-4 w-4" />
        )}
        Purchased ({items.length})
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              <h4 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h4>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent"
                  >
                    <button
                      type="button"
                      onClick={() => onToggle(item.id)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-green-500 bg-green-500 text-white"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>

                    <div className="flex flex-1 items-center gap-2 overflow-hidden">
                      <span className="truncate text-sm text-muted-foreground line-through">
                        {item.itemName}
                      </span>
                      {item.groceryItemTags.map((git) => (
                        <TagBadge key={git.groceryTag.id} tag={git.groceryTag} />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => onUpdatePurchaseDate(item.id)}
                      className="shrink-0 rounded p-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      Edit date
                    </button>

                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
