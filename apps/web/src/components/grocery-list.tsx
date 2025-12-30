"use client";

import {
  useOptimistic,
  useState,
  useTransition,
  useEffect,
  useRef,
} from "react";
import { EmptyState } from "@/components/empty-state";
import { useRouter } from "next/navigation";
import { addItem, toggleItem, deleteItem, updateItemTags } from "@/actions/groceries";
import { createTag, deleteTag } from "@/actions/tags";
import { useConfirm } from "@/components/confirm-provider";
import type { GroceryItem, GroceryTag, GroceryItemTag } from "@amigo/db";

// Extended type for grocery items with their tags
type GroceryItemWithTags = GroceryItem & {
  groceryItemTags: (GroceryItemTag & { groceryTag: GroceryTag })[];
};

interface GroceryListProps {
  initialItems: GroceryItemWithTags[];
  allTags: GroceryTag[];
  wsUrl: string;
}

type OptimisticAction =
  | { type: "add"; item: GroceryItemWithTags }
  | { type: "toggle"; id: string }
  | { type: "delete"; id: string }
  | { type: "update_tags"; id: string; tagIds: string[]; allTags: GroceryTag[] };

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
          ? { ...item, isPurchased: !item.isPurchased }
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

interface TagSelectorProps {
  allTags: GroceryTag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string, color: string) => Promise<void>;
  onDeleteTag: (tagId: string) => void;
}

function TagSelector({
  allTags,
  selectedTagIds,
  onToggleTag,
  onCreateTag,
  onDeleteTag,
}: TagSelectorProps) {
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newTagColor, setNewTagColor] = useState<TagColorKey>("blue");
  const [isCreating, setIsCreating] = useState(false);
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
}

function ItemTagSelector({
  item,
  allTags,
  onUpdateTags,
  onCreateTag,
  onDeleteTag,
}: ItemTagSelectorProps) {
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    item.groceryItemTags.map((it) => it.tagId)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [newTagColor, setNewTagColor] = useState<TagColorKey>("blue");
  const [isCreating, setIsCreating] = useState(false);
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
}: GroceryListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newItemName, setNewItemName] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [allTags, setAllTags] = useState(initialTags);
  const [optimisticItems, addOptimistic] = useOptimistic(
    initialItems,
    groceryReducer
  );

  // WebSocket connection for real-time updates
  useEffect(() => {
    // Construct full WebSocket URL from current page location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const fullWsUrl = `${protocol}//${window.location.host}${wsUrl}`;
    const ws = new WebSocket(fullWsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type: string;
          householdId: string;
        };

        if (payload.type === "GROCERY_UPDATE") {
          // Refresh the page to get authoritative state
          router.refresh();
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
    };

    return () => {
      ws.close();
    };
  }, [wsUrl, router]);

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

  const handleCreateTagForItem = async (name: string, color: string) => {
    const newTag = await createTag(name, color);
    if (newTag) {
      setAllTags((prev) => [...prev, newTag]);
    }
    return newTag;
  };

  // Group items by category
  const groupedItems = optimisticItems.reduce(
    (acc, item) => {
      const category = item.category ?? "Uncategorized";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, GroceryItemWithTags[]>
  );

  const categories = Object.keys(groupedItems).sort();

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
        />
        <button
          type="submit"
          disabled={isPending || !newItemName.trim()}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {/* Selected tags preview */}
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

      {/* Item List by Category */}
      {categories.length === 0 ? (
        <EmptyState message="No items yet. Add something to your grocery list!" />
      ) : (
        <div className="space-y-4">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">
                {category}
              </h3>
              <ul className="divide-y divide-border rounded-lg border bg-card">
                {(groupedItems[category] ?? []).map((item) => (
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
                        <span
                          className={
                            item.isPurchased
                              ? "text-muted-foreground line-through"
                              : "text-foreground"
                          }
                        >
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
                    <div className="flex items-center gap-2">
                      <ItemTagSelector
                        item={item}
                        allTags={allTags}
                        onUpdateTags={handleUpdateItemTags}
                        onCreateTag={handleCreateTagForItem}
                        onDeleteTag={handleDeleteTag}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
