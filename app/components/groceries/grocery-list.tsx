import { useState } from "react";
import type { GroceryTag } from "@amigo/db";
import type { GroceryItemWithTags } from "./types";
import { useGroceryLogic } from "./use-grocery-logic";
import { TagSelector } from "./tag-selector";
import { TagInput } from "./tag-input";
import { GroceryItem } from "./grocery-item";
import { HistorySection } from "./history-section";
import { DatePickerModal } from "./date-picker-modal";
import { EmptyState } from "@/app/components/empty-state";
import { OfflineIndicator } from "@/app/components/offline-indicator";

interface GroceryListProps {
  items: GroceryItemWithTags[];
  allTags: GroceryTag[];
  userId: string;
}

export function GroceryList({ items, allTags, userId }: GroceryListProps) {
  const [newItemName, setNewItemName] = useState("");
  const [newItemTagIds, setNewItemTagIds] = useState<string[]>([]);
  const [recentTags, setRecentTags] = useState<GroceryTag[]>([]);

  // Merge loader tags with locally-created tags so they're available
  // before revalidation completes (for chip display + optimistic updates)
  const mergedTags = [
    ...allTags,
    ...recentTags.filter((rt) => !allTags.some((t) => t.id === rt.id)),
  ];

  const {
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

  async function handleCreateTag(name: string, color: string) {
    const tag = await createTag(name, color);
    if (tag) {
      setRecentTags((prev) => [...prev, tag]);
    }
    return tag;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    addItem(trimmed, newItemTagIds);
    setNewItemName("");
    setNewItemTagIds([]);
    setRecentTags([]);
  }

  function handleToggleNewItemTag(tagId: string) {
    setNewItemTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <OfflineIndicator />

      {/* Add item form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Add an item..."
            className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={!newItemName.trim() || isPending}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
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

      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => filterTagIds.forEach(toggleFilterTag)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Active items */}
      {activeItems.length === 0 && purchasedItems.length === 0 ? (
        <EmptyState
          title="No grocery items"
          description="Add your first item above to get started."
        />
      ) : activeItems.length === 0 && filterTagIds.length > 0 ? (
        <EmptyState
          title="No matching items"
          description="No unpurchased items match the selected tags."
        />
      ) : (
        <div className="space-y-1">
          {activeItems.map((item) => (
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
        </div>
      )}

      {/* Purchased items (history) */}
      <HistorySection
        items={purchasedItems}
        onDelete={deleteItem}
        onToggle={toggleItem}
        onUpdatePurchaseDate={(id) => setDatePickerItemId(id)}
      />

      {/* Date picker modal */}
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
