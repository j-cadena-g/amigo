import { useState, useMemo, useId } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { GroceryItemWithTags } from "./types";
import { formatHistoryDate } from "./constants";
import { CheckButton } from "./check-button";
import { TagBadge } from "./tag-badge";

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
  const listId = useId();

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
    <section className="mt-8">
      <h2>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls={listId}
          className="-ml-1 flex min-h-10 items-center gap-1.5 pr-2 text-heading font-semibold"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
          Bought ({items.length})
        </button>
      </h2>

      {isExpanded && (
        <div id={listId} className="mt-2 space-y-6">
          {groups.map((group) => (
            <div key={group.sortKey}>
              <h3 className="text-sm font-semibold text-muted-foreground">
                {group.label}
              </h3>
              <ul className="mt-1 divide-y divide-border border-y border-border">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 py-2.5">
                    <CheckButton
                      checked
                      onClick={() => onToggle(item.id)}
                      className="mt-0.5"
                      aria-label={`Mark ${item.itemName} as not bought`}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-muted-foreground line-through">
                        {item.itemName}
                      </p>
                      {item.groceryItemTags.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          {item.groceryItemTags.map((git) => (
                            <TagBadge
                              key={git.groceryTag.id}
                              tag={git.groceryTag}
                              className="text-muted-foreground"
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex h-6 shrink-0 items-center gap-4">
                      <button
                        type="button"
                        onClick={() => onUpdatePurchaseDate(item.id)}
                        aria-label={`Edit date for ${item.itemName}`}
                        className="relative text-sm text-muted-foreground underline decoration-muted-foreground/60 underline-offset-4 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] hover:text-foreground hover:decoration-foreground"
                      >
                        Edit date
                      </button>

                      <button
                        type="button"
                        onClick={() => onDelete(item.id)}
                        aria-label={`Delete ${item.itemName}`}
                        className="relative rounded-md p-1 text-muted-foreground before:absolute before:-inset-2 before:content-[''] hover:bg-secondary hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
