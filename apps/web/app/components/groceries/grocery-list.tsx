import { useCallback, useMemo, useState } from "react";
import type { GroceryTag } from "@amigo/db";
import type { GroceryItemWithTags } from "./types";
import { useGroceryLogic } from "./use-grocery-logic";
import { TagSelector } from "./tag-selector";
import { TagInput } from "./tag-input";
import { GroceryItem } from "./grocery-item";
import { HistorySection } from "./history-section";
import { DatePickerModal } from "./date-picker-modal";
import { EmptyState } from "@/app/components/empty-state";
import { PushNotificationButton } from "@/app/components/push-notification-button";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { groupGroceriesByAisle } from "@/app/lib/grocery-categories";

interface GroceryListProps {
  items: GroceryItemWithTags[];
  allTags: GroceryTag[];
  userId: string;
  /** The loader fell back to the offline cache. */
  fromOffline: boolean;
}

export function GroceryList({ items, allTags, userId, fromOffline }: GroceryListProps) {
  const [newItemName, setNewItemName] = useState("");
  const [newItemTagIds, setNewItemTagIds] = useState<string[]>([]);
  const [recentTags, setRecentTags] = useState<GroceryTag[]>([]);

  // Merge loader tags with locally-created tags so they're available
  // before revalidation completes (for chip display + optimistic updates).
  // Memoized so it stays referentially stable for the memoized rows below.
  const mergedTags = useMemo(
    () => [
      ...allTags,
      ...recentTags.filter((rt) => !allTags.some((t) => t.id === rt.id)),
    ],
    [allTags, recentTags]
  );

  const {
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
  } = useGroceryLogic({ items, allTags: mergedTags, userId });

  // Everything still to buy, regardless of the tag filter.
  const toBuyCount = useMemo(
    () => optimisticItems.filter((item) => !item.isPurchased).length,
    [optimisticItems]
  );
  const activeGroups = useMemo(
    () => groupGroceriesByAisle(activeItems),
    [activeItems]
  );

  const handleCreateTag = useCallback(
    async (name: string, color: string) => {
      const tag = await createTag(name, color);
      if (tag) {
        setRecentTags((prev) => [...prev, tag]);
      }
      return tag;
    },
    [createTag]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    addItem(trimmed, newItemTagIds);
    setNewItemName("");
    setNewItemTagIds([]);
    setRecentTags([]);
  }

  const handleToggleNewItemTag = useCallback((tagId: string) => {
    setNewItemTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  function clearFilters() {
    filterTagIds.forEach(toggleFilterTag);
  }

  const hasAnyItems = optimisticItems.length > 0;

  return (
    <div className="max-w-2xl">
      <div className="flex min-h-10 items-start justify-between gap-4">
        <h1 className="type-display min-w-0 text-title-sm md:text-title">
          Groceries{" "}
          <span className="text-muted-foreground">
            <span aria-hidden="true">·</span> {toBuyCount}
            <span className="sr-only"> to buy</span>
          </span>
        </h1>
        <PushNotificationButton />
      </div>
      <p
        role="status"
        aria-live="polite"
        className={fromOffline ? "mt-2 text-sm font-semibold" : "sr-only"}
      >
        {fromOffline
          ? "You're offline, so this is the last saved list. New items, check-offs, deletions, and tag changes will sync when you reconnect."
          : ""}
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="flex gap-2">
          <Input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Add an item"
            aria-label="Add a grocery item"
            autoComplete="off"
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={!newItemName.trim()}>
            Add
          </Button>
        </div>
        <div className="mt-2">
          <TagInput
            allTags={mergedTags}
            selectedTagIds={newItemTagIds}
            onToggleTag={handleToggleNewItemTag}
            onCreateTag={handleCreateTag}
          />
        </div>
      </form>

      <div className="mt-6 flex min-h-10 items-center gap-2">
        <TagSelector
          mode="global"
          allTags={mergedTags}
          selectedTagIds={[]}
          filterTagIds={filterTagIds}
          onFilterToggle={toggleFilterTag}
          onCreateTag={handleCreateTag}
          onDeleteTag={deleteTag}
          onEditTag={editTag}
        />
        {filterTagIds.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={clearFilters}
            className="px-3 text-muted-foreground"
          >
            Clear filters
          </Button>
        )}
        <p role="status" className="ml-auto text-sm text-muted-foreground">
          {isPending ? "Saving…" : ""}
        </p>
      </div>

      {!hasAnyItems ? (
        <EmptyState message="The list is empty. Add what you need above." />
      ) : activeItems.length === 0 ? (
        filterTagIds.length > 0 ? (
          <EmptyState
            message="Nothing left to buy has these tags."
            action={
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState message="Nothing left to buy." />
        )
      ) : (
        <div className="mt-2 flex flex-col gap-4">
          {activeGroups.map((group) => (
            <section key={group.category}>
              <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
                {group.category}
              </h2>
              <ul className="divide-y divide-border border-y border-border">
                {group.items.map((item) => (
                  <GroceryItem
                    key={item.id}
                    item={item}
                    allTags={mergedTags}
                    onToggle={toggleItem}
                    onToggleWithDate={toggleItemWithDate}
                    onDelete={deleteItem}
                    onUpdateTags={updateTags}
                    onEditName={editName}
                    onCreateTag={handleCreateTag}
                    onDeleteTag={deleteTag}
                    onEditTag={editTag}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <HistorySection
        items={purchasedItems}
        onDelete={deleteItem}
        onToggle={toggleItem}
        onUpdatePurchaseDate={(id) => setDatePickerItemId(id)}
      />

      {datePickerItem && datePickerItemId && (
        <DatePickerModal
          item={datePickerItem}
          onConfirm={(date) => {
            if (datePickerItem.isPurchased) {
              confirmUpdatePurchaseDate(datePickerItemId, date);
            } else {
              confirmToggleWithDate(datePickerItemId, date);
            }
          }}
          onCancel={() => setDatePickerItemId(null)}
        />
      )}
    </div>
  );
}
