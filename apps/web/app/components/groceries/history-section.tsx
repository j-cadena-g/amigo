import { useState, useMemo } from "react";
import type { GroceryItemWithTags } from "./types";
import { formatHistoryDate } from "./constants";
import { TagBadge } from "./tag-badge";
import { Check, ChevronDown, ChevronRight, Trash2 } from "lucide-react";

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
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Purchased ({items.length})
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-4">
          {groups.map((group) => (
            <div key={group.sortKey}>
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
                      aria-label={`Mark ${item.itemName} as not purchased`}
                      className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-success bg-success text-success-foreground before:absolute before:-inset-2.5 before:content-['']"
                    >
                      <Check className="h-3 w-3" />
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
                      className="relative shrink-0 rounded p-1 text-xs text-muted-foreground before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] hover:bg-accent hover:text-foreground"
                    >
                      Edit date
                    </button>

                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      aria-label={`Delete ${item.itemName}`}
                      className="relative shrink-0 rounded p-1 text-muted-foreground before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] hover:bg-accent hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
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
