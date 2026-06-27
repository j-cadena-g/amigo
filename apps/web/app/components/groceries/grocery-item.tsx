import { memo, useState, useRef, useCallback, useEffect } from "react";
import type { GroceryTag } from "@amigo/db";
import type { GroceryItemWithTags } from "./types";
import { TagBadge } from "./tag-badge";
import { TagSelector } from "./tag-selector";
import { TrashIcon } from "./icons";

interface GroceryItemProps {
  item: GroceryItemWithTags;
  allTags: GroceryTag[];
  onToggle: (id: string) => void;
  onToggleWithDate: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateTags: (id: string, tagIds: string[]) => void;
  onEditName: (id: string, name: string) => void;
  onCreateTag: (name: string, color: string) => Promise<GroceryTag | undefined>;
  onDeleteTag: (tagId: string) => Promise<void>;
  onEditTag: (tagId: string, name: string, color: string) => Promise<void>;
}

function GroceryItemComponent({
  item,
  allTags,
  onToggle,
  onToggleWithDate,
  onDelete,
  onUpdateTags,
  onEditName,
  onCreateTag,
  onDeleteTag,
  onEditTag,
}: GroceryItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.itemName);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  // Clean up long-press timer if component unmounts mid-press
  // (e.g. item deleted by another user via WebSocket)
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const selectedTagIds = item.groceryItemTags.map((git) => git.groceryTag.id);

  function handleToggleTag(tagId: string) {
    const newTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onUpdateTags(item.id, newTagIds);
  }

  function handleStartEdit() {
    setEditValue(item.itemName);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSaveEdit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== item.itemName) {
      onEditName(item.id, trimmed);
    }
    setIsEditing(false);
  }

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Long-press is a pointer-only enhancement that opens the date picker.
  const handleCheckboxPointerDown = useCallback(() => {
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onToggleWithDate(item.id);
    }, 500);
  }, [item.id, onToggleWithDate]);

  // The primary toggle runs on click, so it works for mouse, touch, and
  // keyboard (Enter/Space dispatch a click on a native button). When a
  // long-press already fired, swallow the trailing click.
  const handleCheckboxClick = useCallback(() => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    onToggle(item.id);
  }, [item.id, onToggle]);

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent">
      <button
        type="button"
        onClick={handleCheckboxClick}
        onPointerDown={handleCheckboxPointerDown}
        onPointerUp={clearLongPressTimer}
        onPointerLeave={clearLongPressTimer}
        onPointerCancel={clearLongPressTimer}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-input hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Mark ${item.itemName} as purchased`}
      />

      <div className="flex flex-1 items-center gap-2 overflow-hidden">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveEdit();
              if (e.key === "Escape") setIsEditing(false);
            }}
            aria-label={`Edit name for ${item.itemName}`}
            className="flex-1 rounded border border-primary bg-transparent px-1 py-0.5 text-sm text-foreground focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={handleStartEdit}
            className="truncate text-left text-sm text-foreground"
          >
            {item.itemName}
          </button>
        )}

        {!isEditing &&
          item.groceryItemTags.map((git) => (
            <TagBadge key={git.groceryTag.id} tag={git.groceryTag} />
          ))}
      </div>

      <TagSelector
        mode="item"
        allTags={allTags}
        selectedTagIds={selectedTagIds}
        onToggleTag={handleToggleTag}
        onCreateTag={onCreateTag}
        onDeleteTag={onDeleteTag}
        onEditTag={onEditTag}
      />

      <button
        type="button"
        onClick={() => onDelete(item.id)}
        aria-label={`Delete ${item.itemName}`}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// Memoized so toggling one row doesn't re-render the whole list. Relies on the
// parent passing stable callbacks and an item reference that only changes when
// that specific item changes.
export const GroceryItem = memo(GroceryItemComponent);
