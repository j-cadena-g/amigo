"use client";

import { useState } from "react";
import type { GroceryItemWithTags } from "./types";
import { formatHistoryDate } from "./constants";
import { TagBadge } from "./tag-badge";
import { ChevronDownIcon, ChevronRightIcon, EditIcon } from "./grocery-icons";

interface HistorySectionProps {
  historyItems: GroceryItemWithTags[];
  currentUserId: string;
  onToggle: (id: string) => void;
  onEditDate: (item: GroceryItemWithTags) => void;
}

export function HistorySection({
  historyItems,
  currentUserId,
  onToggle,
  onEditDate,
}: HistorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (historyItems.length === 0) {
    return null;
  }

  // Group history items by purchase date
  const groupedHistoryItems = historyItems.reduce(
    (acc, item) => {
      const purchaseDate = item.purchasedAt ? new Date(item.purchasedAt) : new Date();
      const dateKey = formatHistoryDate(purchaseDate);
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(item);
      return acc;
    },
    {} as Record<string, GroceryItemWithTags[]>
  );

  // Sort history dates - Today first, then Yesterday, then by date descending
  const historyDates = Object.keys(groupedHistoryItems).sort((a, b) => {
    if (a === "Today") return -1;
    if (b === "Today") return 1;
    if (a === "Yesterday") return -1;
    if (b === "Yesterday") return 1;
    // Parse full dates and sort descending
    return new Date(b).getTime() - new Date(a).getTime();
  });

  return (
    <div className="border-t pt-4">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 text-muted-foreground hover:text-foreground"
      >
        {isExpanded ? (
          <ChevronDownIcon className="h-5 w-5" />
        ) : (
          <ChevronRightIcon className="h-5 w-5" />
        )}
        <span className="text-sm font-semibold uppercase">
          Purchase History ({historyItems.length} {historyItems.length === 1 ? "item" : "items"})
        </span>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {historyDates.map((dateLabel) => (
            <div key={dateLabel}>
              <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {dateLabel}
              </h4>
              <ul className="divide-y divide-border rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30">
                {(groupedHistoryItems[dateLabel] ?? []).map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => onEditDate(item)}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.isPurchased}
                        onChange={() => onToggle(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-5 w-5 rounded border-input bg-background text-primary focus:ring-primary"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground line-through">
                          {item.itemName}
                        </span>
                        {/* Edit indicator */}
                        <EditIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
                        {item.groceryItemTags.map((itemTag) => (
                          <TagBadge
                            key={itemTag.tagId}
                            tag={itemTag.groceryTag}
                          />
                        ))}
                        {item.createdByUser && item.createdByUserId !== currentUserId && (
                          <span className="text-xs text-muted-foreground/70">
                            by {item.createdByUser.name ?? item.createdByUser.email.split("@")[0]}
                          </span>
                        )}
                      </div>
                    </div>
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
