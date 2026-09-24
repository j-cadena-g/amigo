import { memo, useState, useRef, useCallback, useEffect } from "react";
import type { GroceryTag } from "@amigo/db";
import { Trash2 } from "lucide-react";
import { cn } from "@/app/lib/utils";
import type { GroceryItemWithTags } from "./types";
import { CheckButton } from "./check-button";
import { checkOffDelayMs, prefersReducedMotion } from "./check-off";
import { TagBadge } from "./tag-badge";
import { TagSelector } from "./tag-selector";

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
  const [isCheckingOff, setIsCheckingOff] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  // Clean up timers if the component unmounts mid-press
  // (e.g. item deleted by another user via WebSocket)
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (checkOffTimerRef.current) {
        clearTimeout(checkOffTimerRef.current);
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
  // long-press already fired, swallow the trailing click. The name is struck
  // through first, then the item moves to the bought list.
  const handleCheckboxClick = useCallback(() => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    if (checkOffTimerRef.current) return;

    const delay = checkOffDelayMs(prefersReducedMotion());
    if (delay === 0) {
      onToggle(item.id);
      return;
    }

    setIsCheckingOff(true);
    checkOffTimerRef.current = setTimeout(() => {
      checkOffTimerRef.current = null;
      setIsCheckingOff(false);
      onToggle(item.id);
    }, delay);
  }, [item.id, onToggle]);

  return (
    <li className="flex items-start gap-3 py-2.5">
      <CheckButton
        checked={isCheckingOff}
        onClick={handleCheckboxClick}
        onPointerDown={handleCheckboxPointerDown}
        onPointerUp={clearLongPressTimer}
        onPointerLeave={clearLongPressTimer}
        onPointerCancel={clearLongPressTimer}
        className="mt-0.5"
        aria-label={`Mark ${item.itemName} as bought`}
      />

      <div className="min-w-0 flex-1">
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
            className="-ml-1 block w-full rounded-md border border-foreground bg-background px-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        ) : (
          <button
            type="button"
            onClick={handleStartEdit}
            className={cn(
              "relative block max-w-full truncate text-left text-base text-foreground",
              "after:absolute after:inset-x-0 after:top-1/2 after:-mt-px after:h-0.5 after:origin-left after:bg-foreground after:transition-transform after:duration-150 after:ease-out after:content-['']",
              isCheckingOff ? "after:scale-x-100" : "after:scale-x-0"
            )}
          >
            {item.itemName}
          </button>
        )}

        {item.groceryItemTags.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {item.groceryItemTags.map((git) => (
              <TagBadge key={git.groceryTag.id} tag={git.groceryTag} />
            ))}
          </div>
        )}
      </div>

      <div className="flex h-6 shrink-0 items-center gap-4">
        <TagSelector
          mode="item"
          itemName={item.itemName}
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
          className="relative rounded-md p-1 text-muted-foreground before:absolute before:-inset-2 before:content-[''] hover:bg-secondary hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

// Memoized so toggling one row doesn't re-render the whole list. Relies on the
// parent passing stable callbacks and an item reference that only changes when
// that specific item changes.
export const GroceryItem = memo(GroceryItemComponent);
