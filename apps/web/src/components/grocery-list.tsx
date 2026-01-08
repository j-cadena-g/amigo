"use client";

import {
  useOptimistic,
  useState,
  useTransition,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { EmptyState } from "@/components/empty-state";
import { useRouter } from "next/navigation";
import { addItem, toggleItem, deleteItem, updateItemTags, updateItem } from "@/actions/groceries";
import { createTag, deleteTag, updateTag } from "@/actions/tags";
import { useConfirm } from "@/components/confirm-provider";
import { OfflineIndicator } from "@/components/offline-indicator";
import { useWebSocket } from "@/hooks/use-websocket";
import type { GroceryItem, GroceryTag, GroceryItemTag } from "@amigo/db";

// Extended type for grocery items with their tags
type GroceryItemWithTags = GroceryItem & {
  groceryItemTags: (GroceryItemTag & { groceryTag: GroceryTag })[];
};

interface GroceryListProps {
  initialItems: GroceryItemWithTags[];
  allTags: GroceryTag[];
  wsUrl: string;
  householdId: string;
  userId: string;
}

type OptimisticAction =
  | { type: "add"; item: GroceryItemWithTags }
  | { type: "toggle"; id: string }
  | { type: "delete"; id: string }
  | { type: "update_tags"; id: string; tagIds: string[]; allTags: GroceryTag[] }
  | { type: "edit_name"; id: string; name: string };

function groceryReducer(
  state: GroceryItemWithTags[],
  action: OptimisticAction
): GroceryItemWithTags[] {
  switch (action.type) {
    case "add":
      return [action.item, ...state];
    case "toggle":
      return state.map((item) =>
        item.id === action.id
          ? {
              ...item,
              isPurchased: !item.isPurchased,
              purchasedAt: item.isPurchased ? null : new Date(),
            }
          : item
      );
    case "delete":
      return state.filter((item) => item.id !== action.id);
    case "update_tags":
      return state.map((item) =>
        item.id === action.id
          ? {
              ...item,
              groceryItemTags: action.tagIds.map((tagId) => {
                const tag = action.allTags.find((t) => t.id === tagId);
                return {
                  itemId: item.id,
                  tagId,
                  groceryTag: tag || {
                    id: tagId,
                    householdId: "",
                    name: "...",
                    color: "gray",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                };
              }),
            }
          : item
      );
    case "edit_name":
      return state.map((item) =>
        item.id === action.id
          ? { ...item, itemName: action.name, updatedAt: new Date() }
          : item
      );
    default:
      return state;
  }
}

// Tag color mapping for badges
const tagColors = {
  blue: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" },
  green: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
  red: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
  yellow: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" },
  purple: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300" },
  orange: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300" },
  pink: { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-300" },
  gray: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" },
} as const;

// Solid colors for swatch picker
const swatchColors = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  gray: "bg-gray-500",
} as const;

type TagColorKey = keyof typeof tagColors;

function TagBadge({ tag }: { tag: GroceryTag }) {
  const colorKey = (tag.color in tagColors ? tag.color : "gray") as TagColorKey;
  const colors = tagColors[colorKey];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      {tag.name}
    </span>
  );
}

// Date formatting helper for history sections
function formatHistoryDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly.getTime() === today.getTime()) {
    return "Today";
  }
  if (dateOnly.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

interface TagSelectorProps {
  allTags: GroceryTag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string, color: string) => Promise<void>;
  onDeleteTag: (tagId: string) => void;
  onEditTag: (tagId: string, name: string, color: string) => Promise<void>;
}

function TagSelector({
  allTags,
  selectedTagIds,
  onToggleTag,
  onCreateTag,
  onDeleteTag,
  onEditTag,
}: TagSelectorProps) {
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newTagColor, setNewTagColor] = useState<TagColorKey>("blue");
  const [isCreating, setIsCreating] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<TagColorKey>("blue");
  const [isSaving, setIsSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter tags by search query
  const filteredTags = allTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  // Check if exact match exists (case-insensitive)
  const exactMatchTag = allTags.find(
    (tag) => tag.name.toLowerCase() === searchQuery.toLowerCase().trim()
  );

  const canCreateTag = searchQuery.trim() && !exactMatchTag;

  const handleCreateTag = async () => {
    if (!canCreateTag) return;
    setIsCreating(true);
    try {
      await onCreateTag(searchQuery.trim(), newTagColor);
      setSearchQuery("");
    } finally {
      setIsCreating(false);
    }
  };

  const startEditingTag = (tag: GroceryTag) => {
    setEditingTagId(tag.id);
    setEditName(tag.name);
    setEditColor((tag.color in tagColors ? tag.color : "blue") as TagColorKey);
  };

  const cancelEditingTag = () => {
    setEditingTagId(null);
    setEditName("");
    setEditColor("blue");
  };

  const saveEditingTag = async () => {
    if (!editingTagId || !editName.trim()) return;
    setIsSaving(true);
    try {
      await onEditTag(editingTagId, editName.trim(), editColor);
      setEditingTagId(null);
      setEditName("");
    } finally {
      setIsSaving(false);
    }
  };

  const colorOptions = Object.keys(swatchColors) as TagColorKey[];

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        Tags
        {selectedTagIds.length > 0 && (
          <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
            {selectedTagIds.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-2 shadow-lg">
          {/* Search/Filter Input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or create tag..."
            className="mb-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreateTag) {
                e.preventDefault();
                handleCreateTag();
              }
            }}
          />

          {/* Filtered tag list */}
          <div className="max-h-48 overflow-y-auto">
            {filteredTags.length === 0 && !canCreateTag ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">
                {allTags.length === 0 ? "No tags yet" : "No matching tags"}
              </p>
            ) : (
              filteredTags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                const isExactMatch =
                  tag.name.toLowerCase() === searchQuery.toLowerCase().trim();
                const isEditing = editingTagId === tag.id;

                if (isEditing) {
                  return (
                    <div key={tag.id} className="space-y-2 rounded-md bg-muted/50 p-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEditingTag();
                          } else if (e.key === "Escape") {
                            cancelEditingTag();
                          }
                        }}
                      />
                      <div className="flex items-center gap-1">
                        {colorOptions.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setEditColor(color)}
                            className={`h-6 w-6 rounded-full ${swatchColors[color]} ${
                              editColor === color
                                ? "ring-2 ring-primary ring-offset-1"
                                : "hover:ring-1 hover:ring-muted-foreground"
                            }`}
                            aria-label={`Select ${color} color`}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={saveEditingTag}
                          disabled={isSaving || !editName.trim()}
                          className="flex-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {isSaving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditingTag}
                          className="flex-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={tag.id}
                    className={`group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                      isSelected ? "bg-accent" : ""
                    } ${isExactMatch && searchQuery ? "ring-2 ring-primary ring-offset-1" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleTag(tag.id)}
                      className="flex flex-1 items-center gap-2"
                    >
                      <TagBadge tag={tag} />
                    </button>
                    <div className="flex items-center gap-1">
                      {isSelected && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4 text-primary"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditingTag(tag);
                        }}
                        className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                        aria-label="Edit tag"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (await confirm({
                            title: "Delete Tag",
                            description: "Are you sure you want to delete this tag globally? This action cannot be undone.",
                            variant: "destructive",
                            confirmText: "Delete",
                          })) {
                            onDeleteTag(tag.id);
                          }
                        }}
                        className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        aria-label="Delete tag"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Create new tag section - only visible when no exact match */}
          {canCreateTag && (
            <div className="mt-2 border-t pt-2">
              <p className="mb-2 text-xs text-muted-foreground">
                Create &quot;{searchQuery.trim()}&quot;
              </p>
              {/* Color swatch picker */}
              <div className="mb-2 flex items-center gap-1">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewTagColor(color)}
                    className={`h-10 w-10 rounded-full ${swatchColors[color]} ${
                      newTagColor === color
                        ? "ring-2 ring-primary ring-offset-2"
                        : "hover:ring-2 hover:ring-muted-foreground hover:ring-offset-1"
                    }`}
                    aria-label={`Select ${color} color`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={handleCreateTag}
                disabled={isCreating}
                className="w-full rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isCreating ? "Creating..." : "Create Tag"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ItemTagSelectorProps {
  item: GroceryItemWithTags;
  allTags: GroceryTag[];
  onUpdateTags: (itemId: string, tagIds: string[]) => void;
  onCreateTag: (name: string, color: string) => Promise<GroceryTag | undefined>;
  onDeleteTag: (tagId: string) => void;
  onEditTag: (tagId: string, name: string, color: string) => Promise<void>;
}

function ItemTagSelector({
  item,
  allTags,
  onUpdateTags,
  onCreateTag,
  onDeleteTag,
  onEditTag,
}: ItemTagSelectorProps) {
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    item.groceryItemTags.map((it) => it.tagId)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [newTagColor, setNewTagColor] = useState<TagColorKey>("blue");
  const [isCreating, setIsCreating] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<TagColorKey>("blue");
  const [isSaving, setIsSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync selected tags when item changes (e.g., from server refresh)
  useEffect(() => {
    setSelectedTagIds(item.groceryItemTags.map((it) => it.tagId));
  }, [item.groceryItemTags]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter tags by search query
  const filteredTags = allTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  // Check if exact match exists (case-insensitive)
  const exactMatchTag = allTags.find(
    (tag) => tag.name.toLowerCase() === searchQuery.toLowerCase().trim()
  );

  const canCreateTag = searchQuery.trim() && !exactMatchTag;

  const handleToggleTag = (tagId: string) => {
    const newTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    setSelectedTagIds(newTagIds);
    onUpdateTags(item.id, newTagIds);
  };

  const handleCreateTag = async () => {
    if (!canCreateTag) return;
    setIsCreating(true);
    try {
      const newTag = await onCreateTag(searchQuery.trim(), newTagColor);
      if (newTag) {
        // Auto-select the newly created tag
        const newTagIds = [...selectedTagIds, newTag.id];
        setSelectedTagIds(newTagIds);
        onUpdateTags(item.id, newTagIds);
      }
      setSearchQuery("");
    } finally {
      setIsCreating(false);
    }
  };

  const startEditingTag = (tag: GroceryTag) => {
    setEditingTagId(tag.id);
    setEditName(tag.name);
    setEditColor((tag.color in tagColors ? tag.color : "blue") as TagColorKey);
  };

  const cancelEditingTag = () => {
    setEditingTagId(null);
    setEditName("");
    setEditColor("blue");
  };

  const saveEditingTag = async () => {
    if (!editingTagId || !editName.trim()) return;
    setIsSaving(true);
    try {
      await onEditTag(editingTagId, editName.trim(), editColor);
      setEditingTagId(null);
      setEditName("");
    } finally {
      setIsSaving(false);
    }
  };

  const colorOptions = Object.keys(swatchColors) as TagColorKey[];

  return (
    <div
      className="relative"
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Edit tags"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-2 shadow-lg">
          {/* Search/Filter Input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Search or create tag..."
            className="mb-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && canCreateTag) {
                e.preventDefault();
                handleCreateTag();
              }
            }}
          />

          {/* Filtered tag list */}
          <div className="max-h-48 overflow-y-auto">
            {filteredTags.length === 0 && !canCreateTag ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">
                {allTags.length === 0 ? "No tags yet" : "No matching tags"}
              </p>
            ) : (
              filteredTags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                const isExactMatch =
                  tag.name.toLowerCase() === searchQuery.toLowerCase().trim();
                const isEditing = editingTagId === tag.id;

                if (isEditing) {
                  return (
                    <div key={tag.id} className="space-y-2 rounded-md bg-muted/50 p-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEditingTag();
                          } else if (e.key === "Escape") {
                            cancelEditingTag();
                          }
                        }}
                      />
                      <div className="flex items-center gap-1">
                        {colorOptions.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditColor(color);
                            }}
                            className={`h-6 w-6 rounded-full ${swatchColors[color]} ${
                              editColor === color
                                ? "ring-2 ring-primary ring-offset-1"
                                : "hover:ring-1 hover:ring-muted-foreground"
                            }`}
                            aria-label={`Select ${color} color`}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            saveEditingTag();
                          }}
                          disabled={isSaving || !editName.trim()}
                          className="flex-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {isSaving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEditingTag();
                          }}
                          className="flex-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={tag.id}
                    className={`group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                      isSelected ? "bg-accent" : ""
                    } ${isExactMatch && searchQuery ? "ring-2 ring-primary ring-offset-1" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTag(tag.id);
                      }}
                      className="flex flex-1 items-center gap-2"
                    >
                      <TagBadge tag={tag} />
                    </button>
                    <div className="flex items-center gap-1">
                      {isSelected && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4 text-primary"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditingTag(tag);
                        }}
                        className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                        aria-label="Edit tag"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (await confirm({
                            title: "Delete Tag",
                            description: "Are you sure you want to delete this tag globally? This action cannot be undone.",
                            variant: "destructive",
                            confirmText: "Delete",
                          })) {
                            onDeleteTag(tag.id);
                          }
                        }}
                        className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        aria-label="Delete tag"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Create new tag section - only visible when no exact match */}
          {canCreateTag && (
            <div className="mt-2 border-t pt-2">
              <p className="mb-2 text-xs text-muted-foreground">
                Create &quot;{searchQuery.trim()}&quot;
              </p>
              {/* Color swatch picker */}
              <div className="mb-2 flex items-center gap-1">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewTagColor(color);
                    }}
                    className={`h-10 w-10 rounded-full ${swatchColors[color]} ${
                      newTagColor === color
                        ? "ring-2 ring-primary ring-offset-2"
                        : "hover:ring-2 hover:ring-muted-foreground hover:ring-offset-1"
                    }`}
                    aria-label={`Select ${color} color`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateTag();
                }}
                disabled={isCreating}
                className="w-full rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isCreating ? "Creating..." : "Create Tag"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function GroceryList({
  initialItems,
  allTags: initialTags,
  wsUrl,
  householdId: _householdId,
  userId: _userId,
}: GroceryListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newItemName, setNewItemName] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [allTags, setAllTags] = useState(initialTags);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [optimisticItems, addOptimistic] = useOptimistic(
    initialItems,
    groceryReducer
  );

  // WebSocket message handler
  const handleWebSocketMessage = useCallback(
    (data: unknown) => {
      const payload = data as { type: string; householdId: string };
      if (payload.type === "GROCERY_UPDATE") {
        // Refresh to get authoritative state
        router.refresh();
      }
    },
    [router]
  );

  // WebSocket connection with auto-reconnect
  useWebSocket({
    url: wsUrl,
    onMessage: handleWebSocketMessage,
  });

  // Sync allTags with server state on refresh
  useEffect(() => {
    setAllTags(initialTags);
  }, [initialTags]);

  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleCreateTag = async (name: string, color: string) => {
    const newTag = await createTag(name, color);
    if (newTag) {
      setAllTags((prev) => [...prev, newTag]);
      // Auto-select the newly created tag
      setSelectedTagIds((prev) => [...prev, newTag.id]);
    }
  };

  const handleDeleteTag = (tagId: string) => {
    // Optimistically remove from allTags
    setAllTags((prev) => prev.filter((t) => t.id !== tagId));
    // Remove from selected tags if selected
    setSelectedTagIds((prev) => prev.filter((id) => id !== tagId));
    // Optimistically remove tag from all items that have it
    // This is handled by rerender since allTags changes and groceryItemTags
    // will be filtered on next server refresh via WebSocket
    startTransition(async () => {
      await deleteTag(tagId);
    });
  };

  const handleEditTag = async (tagId: string, name: string, color: string) => {
    // Optimistically update the tag
    setAllTags((prev) =>
      prev.map((t) =>
        t.id === tagId
          ? { ...t, name, color, updatedAt: new Date() }
          : t
      )
    );
    await updateTag(tagId, name, color);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItemName.trim();
    if (!name) return;

    const tagIdsToAdd = [...selectedTagIds];
    setNewItemName("");
    setSelectedTagIds([]);

    // Build optimistic item with tags
    const tempItem: GroceryItemWithTags = {
      id: crypto.randomUUID(),
      householdId: "",
      createdByUserId: "",
      itemName: name,
      category: "Uncategorized",
      isPurchased: false,
      purchasedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      groceryItemTags: tagIdsToAdd.map((tagId) => {
        const tag = allTags.find((t) => t.id === tagId);
        return {
          itemId: "",
          tagId,
          groceryTag: tag || {
            id: tagId,
            householdId: "",
            name: "...",
            color: "gray",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        };
      }),
    };

    startTransition(async () => {
      addOptimistic({ type: "add", item: tempItem });
      await addItem(name, undefined, tagIdsToAdd);
    });
  };

  const handleToggleItem = async (id: string) => {
    startTransition(async () => {
      addOptimistic({ type: "toggle", id });
      await toggleItem(id);
    });
  };

  const handleDeleteItem = async (id: string) => {
    startTransition(async () => {
      addOptimistic({ type: "delete", id });
      await deleteItem(id);
    });
  };

  const handleUpdateItemTags = (itemId: string, tagIds: string[]) => {
    startTransition(async () => {
      addOptimistic({ type: "update_tags", id: itemId, tagIds, allTags });
      await updateItemTags(itemId, tagIds);
    });
  };

  const handleStartEdit = (item: GroceryItemWithTags) => {
    setEditingItemId(item.id);
    setEditItemName(item.itemName);
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditItemName("");
  };

  const handleSaveEdit = async () => {
    if (!editingItemId || !editItemName.trim()) return;
    const newName = editItemName.trim();
    const itemId = editingItemId;
    setEditingItemId(null);
    setEditItemName("");
    startTransition(async () => {
      addOptimistic({ type: "edit_name", id: itemId, name: newName });
      await updateItem(itemId, newName);
    });
  };

  const handleCreateTagForItem = async (name: string, color: string) => {
    const newTag = await createTag(name, color);
    if (newTag) {
      setAllTags((prev) => [...prev, newTag]);
    }
    return newTag;
  };

  // Split items into active and history (purchased)
  const activeItems = optimisticItems.filter((item) => !item.isPurchased);
  const historyItems = optimisticItems.filter((item) => item.isPurchased);

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
    <div className="space-y-6">
      {/* Add Item Form */}
      <form onSubmit={handleAddItem} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Add an item..."
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-4 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={isPending}
        />
        <TagSelector
          allTags={allTags}
          selectedTagIds={selectedTagIds}
          onToggleTag={handleToggleTag}
          onCreateTag={handleCreateTag}
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
            <li
              key={item.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={item.isPurchased}
                  onChange={() => handleToggleItem(item.id)}
                  className="h-5 w-5 shrink-0 rounded border-input bg-background text-primary focus:ring-primary"
                />
                {editingItemId === item.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSaveEdit();
                    }}
                    className="flex flex-1 items-center gap-2 min-w-0"
                  >
                    <input
                      type="text"
                      value={editItemName}
                      onChange={(e) => setEditItemName(e.target.value)}
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
                      onClick={() => handleStartEdit(item)}
                      className="text-foreground text-left hover:underline focus:outline-none focus:underline truncate"
                    >
                      {item.itemName}
                    </button>
                    {item.groceryItemTags.map((itemTag) => (
                      <TagBadge key={itemTag.tagId} tag={itemTag.groceryTag} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ItemTagSelector
                  item={item}
                  allTags={allTags}
                  onUpdateTags={handleUpdateItemTags}
                  onCreateTag={handleCreateTagForItem}
                  onDeleteTag={handleDeleteTag}
                  onEditTag={handleEditTag}
                />
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete item"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Purchase History Section */}
      {historyItems.length > 0 && (
        <div className="border-t pt-4">
          <button
            type="button"
            onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
            className="flex w-full items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            {isHistoryExpanded ? (
              <ChevronDownIcon className="h-5 w-5" />
            ) : (
              <ChevronRightIcon className="h-5 w-5" />
            )}
            <span className="text-sm font-semibold uppercase">
              Purchase History ({historyItems.length} {historyItems.length === 1 ? "item" : "items"})
            </span>
          </button>

          {isHistoryExpanded && (
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
                        className="flex items-center justify-between px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={item.isPurchased}
                            onChange={() => handleToggleItem(item.id)}
                            className="h-5 w-5 rounded border-input bg-background text-primary focus:ring-primary"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground line-through">
                              {item.itemName}
                            </span>
                            {item.groceryItemTags.map((itemTag) => (
                              <TagBadge
                                key={itemTag.tagId}
                                tag={itemTag.groceryTag}
                              />
                            ))}
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
      )}

      {/* Offline indicator */}
      <OfflineIndicator />
    </div>
  );
}
