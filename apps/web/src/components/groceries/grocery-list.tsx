"use client";

import { useState, useCallback } from "react";
import type { GroceryTag } from "@amigo/db";
import type { GroceryItemWithTags } from "./types";
import { useGroceryLogic } from "./use-grocery-logic";
import { TagSelector } from "./tag-selector";
import { TagBadge } from "./tag-badge";
import { GroceryItemRow } from "./grocery-item";
import { HistorySection } from "./history-section";
import { DatePickerModal } from "./date-picker-modal";
import { EmptyState } from "@/components/empty-state";
import { OfflineIndicator } from "@/components/offline-indicator";

interface GroceryListProps {
  initialItems: GroceryItemWithTags[];
  allTags: GroceryTag[];
  wsUrl: string;
  householdId: string;
  userId: string;
}

export function GroceryList({
  initialItems,
  allTags: initialTags,
  wsUrl,
  householdId: _householdId,
  userId,
}: GroceryListProps) {
  // Form state for adding new items
  const [newItemName, setNewItemName] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Filter state
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);

  // Date picker state for long-press and history edit
  const [datepickerItem, setDatepickerItem] = useState<GroceryItemWithTags | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0] ?? "";
  });

  // Use the extracted logic hook
  const {
    isPending,
    allTags,
    activeItems,
    historyItems,
    handleCreateTag,
    handleDeleteTag,
    handleEditTag,
    handleAddItem,
    handleToggleItem,
    handleToggleItemWithDate,
    handleDeleteItem,
    handleUpdateItemTags,
    handleEditItemName,
    handleUpdatePurchaseDate,
  } = useGroceryLogic({
    initialItems,
    initialTags,
    wsUrl,
    userId,
  });

  // Form handlers
  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleFormCreateTag = async (name: string, color: string) => {
    const newTag = await handleCreateTag(name, color);
    if (newTag) {
      // Auto-select the newly created tag
      setSelectedTagIds((prev) => [...prev, newTag.id]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItemName.trim();
    if (!name) return;

    const tagIdsToAdd = [...selectedTagIds];
    setNewItemName("");
    setSelectedTagIds([]);

    handleAddItem(name, tagIdsToAdd);
  };

  // Long-press handler - opens date picker for active items
  const handleLongPress = useCallback((item: GroceryItemWithTags) => {
    setDatepickerItem(item);
    setSelectedDate(new Date().toISOString().split("T")[0] ?? "");
  }, []);

  // History date edit handler
  const handleHistoryDateEdit = useCallback((item: GroceryItemWithTags) => {
    setDatepickerItem(item);
    const currentDate = item.purchasedAt
      ? new Date(item.purchasedAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    setSelectedDate(currentDate ?? "");
  }, []);

  // Date picker submit
  const handleDatePickerSubmit = useCallback(() => {
    if (!datepickerItem || !selectedDate) return;

    const purchaseDate = new Date(selectedDate + "T12:00:00"); // Noon to avoid timezone issues
    const itemId = datepickerItem.id;
    const isHistoryItem = datepickerItem.isPurchased;

    setDatepickerItem(null);

    if (isHistoryItem) {
      // Editing existing history item
      handleUpdatePurchaseDate(itemId, purchaseDate);
    } else {
      // New purchase with custom date (from long-press)
      handleToggleItemWithDate(itemId, purchaseDate);
    }
  }, [datepickerItem, selectedDate, handleUpdatePurchaseDate, handleToggleItemWithDate]);

  const handleDatePickerCancel = useCallback(() => {
    setDatepickerItem(null);
  }, []);

  // Apply tag filter to active items
  const filteredActiveItems =
    filterTagIds.length === 0
      ? activeItems
      : activeItems.filter((item) =>
          filterTagIds.some((filterTagId) =>
            item.groceryItemTags.some((itemTag) => itemTag.tagId === filterTagId)
          )
        );

  // Get tags that are actually used by active items (for filter display)
  const usedTagIds = new Set(
    activeItems.flatMap((item) => item.groceryItemTags.map((it) => it.tagId))
  );
  const filterableTags = allTags.filter((tag) => usedTagIds.has(tag.id));

  return (
    <div className="space-y-6">
      {/* Add Item Form */}
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Add an item..."
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-4 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={isPending}
        />
        <TagSelector
          mode="global"
          allTags={allTags}
          selectedTagIds={selectedTagIds}
          onToggleTag={handleToggleTag}
          onCreateTag={handleFormCreateTag}
          onDeleteTag={handleDeleteTag}
          onEditTag={handleEditTag}
        />
        <button
          type="submit"
          disabled={isPending || !newItemName.trim()}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {/* Selected tags preview (for adding items) */}
      {selectedTagIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTagIds.map((tagId) => {
            const tag = allTags.find((t) => t.id === tagId);
            if (!tag) return null;
            return (
              <button
                key={tagId}
                type="button"
                onClick={() => handleToggleTag(tagId)}
                className="group inline-flex items-center gap-1"
              >
                <TagBadge tag={tag} />
                <span className="text-xs text-muted-foreground group-hover:text-destructive">
                  ×
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Tag Filter */}
      {filterableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter:</span>
          {filterableTags.map((tag) => {
            const isActive = filterTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() =>
                  setFilterTagIds((prev) =>
                    isActive
                      ? prev.filter((id) => id !== tag.id)
                      : [...prev, tag.id]
                  )
                }
                className={`transition-opacity ${isActive ? "" : "opacity-50 hover:opacity-75"}`}
              >
                <TagBadge tag={tag} />
              </button>
            );
          })}
          {filterTagIds.length > 0 && (
            <button
              type="button"
              onClick={() => setFilterTagIds([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Active Item List */}
      {activeItems.length === 0 ? (
        <EmptyState message="No items yet. Add something to your grocery list!" />
      ) : filteredActiveItems.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
          No items match the selected filter.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border bg-card">
          {filteredActiveItems.map((item) => (
            <GroceryItemRow
              key={item.id}
              item={item}
              allTags={allTags}
              currentUserId={userId}
              onToggle={handleToggleItem}
              onDelete={handleDeleteItem}
              onUpdateTags={handleUpdateItemTags}
              onEditName={handleEditItemName}
              onLongPress={handleLongPress}
              onCreateTag={handleCreateTag}
              onDeleteTag={handleDeleteTag}
              onEditTag={handleEditTag}
            />
          ))}
        </ul>
      )}

      {/* Purchase History Section */}
      <HistorySection
        historyItems={historyItems}
        currentUserId={userId}
        onToggle={handleToggleItem}
        onEditDate={handleHistoryDateEdit}
      />

      {/* Offline indicator */}
      <OfflineIndicator />

      {/* Date Picker Modal */}
      {datepickerItem && (
        <DatePickerModal
          item={datepickerItem}
          selectedDate={selectedDate}
          isPending={isPending}
          onDateChange={setSelectedDate}
          onSubmit={handleDatePickerSubmit}
          onCancel={handleDatePickerCancel}
        />
      )}
    </div>
  );
}
