"use client";

import { useState, useRef, useCallback } from "react";
import type { GroceryTag } from "@amigo/db";
import type { GroceryItemWithTags } from "./types";
import { TagBadge } from "./tag-badge";
import { TagSelector } from "./tag-selector";
import { TrashIcon } from "./grocery-icons";

const LONG_PRESS_DURATION = 500;

interface GroceryItemRowProps {
  item: GroceryItemWithTags;
  allTags: GroceryTag[];
  currentUserId: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateTags: (itemId: string, tagIds: string[]) => void;
  onEditName: (id: string, name: string) => void;
  onLongPress: (item: GroceryItemWithTags) => void;
  onCreateTag: (name: string, color: string) => Promise<GroceryTag | undefined>;
  onDeleteTag: (tagId: string) => void;
  onEditTag: (tagId: string, name: string, color: string) => Promise<void>;
}

export function GroceryItemRow({
  item,
  allTags,
  currentUserId,
  onToggle,
  onDelete,
  onUpdateTags,
  onEditName,
  onLongPress,
  onCreateTag,
  onDeleteTag,
  onEditTag,
}: GroceryItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.itemName);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const handlePointerDown = useCallback(() => {
    if (item.isPurchased) return; // Only for active items

    longPressTriggeredRef.current = false;

    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress(item);
    }, LONG_PRESS_DURATION);
  }, [item, onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      if (longPressTriggeredRef.current) {
        e.preventDefault();
        longPressTriggeredRef.current = false;
        return;
      }
      onToggle(item.id);
    },
    [item.id, onToggle]
  );

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditValue(item.itemName);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue(item.itemName);
  };

  const handleSaveEdit = () => {
    if (!editValue.trim()) return;
    const newName = editValue.trim();
    setIsEditing(false);
    if (newName !== item.itemName) {
      onEditName(item.id, newName);
    }
  };

  const handleToggleTag = (tagId: string) => {
    const currentTagIds = item.groceryItemTags.map((it) => it.tagId);
    const newTagIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId];
    onUpdateTags(item.id, newTagIds);
  };

  return (
    <li className="flex items-start justify-between px-4 py-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <input
          type="checkbox"
          checked={item.isPurchased}
          onChange={() => {}} // Handled by click
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerUp}
          onClick={handleCheckboxClick}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-input bg-background text-primary focus:ring-primary touch-none"
        />
        {isEditing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveEdit();
            }}
            className="flex flex-1 items-center gap-2 min-w-0"
          >
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  handleCancelEdit();
                }
              }}
              autoFocus
              className="flex-1 min-w-0 rounded-md border border-input bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handleStartEdit}
              className="text-foreground text-left hover:underline focus:outline-none focus:underline truncate"
            >
              {item.itemName}
            </button>
            {item.groceryItemTags.map((itemTag) => (
              <TagBadge key={itemTag.tagId} tag={itemTag.groceryTag} />
            ))}
            {item.createdByUser && item.createdByUserId !== currentUserId && (
              <span className="text-xs text-muted-foreground">
                by {item.createdByUser.name ?? item.createdByUser.email.split("@")[0]}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        <TagSelector
          mode="item"
          allTags={allTags}
          selectedTagIds={item.groceryItemTags.map((it) => it.tagId)}
          onToggleTag={handleToggleTag}
          onCreateTag={onCreateTag}
          onDeleteTag={onDeleteTag}
          onEditTag={onEditTag}
        />
        <button
          onClick={() => onDelete(item.id)}
          className="flex items-center justify-center text-muted-foreground hover:text-destructive"
          aria-label="Delete item"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
    </li>
  );
}
