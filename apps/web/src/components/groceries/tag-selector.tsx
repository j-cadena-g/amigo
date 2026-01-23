"use client";

import { useState, useEffect, useRef } from "react";
import type { GroceryTag } from "@amigo/db";
import { useConfirm } from "@/components/confirm-provider";
import { tagColors, swatchColors, type TagColorKey } from "./constants";
import { TagBadge } from "./tag-badge";
import { TagIcon, CheckIcon, EditIcon, TrashIcon } from "./grocery-icons";

interface TagSelectorBaseProps {
  allTags: GroceryTag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string, color: string) => Promise<GroceryTag | void>;
  onDeleteTag: (tagId: string) => void;
  onEditTag: (tagId: string, name: string, color: string) => Promise<void>;
}

interface GlobalTagSelectorProps extends TagSelectorBaseProps {
  mode: "global";
}

interface ItemTagSelectorProps extends TagSelectorBaseProps {
  mode: "item";
}

type TagSelectorProps = GlobalTagSelectorProps | ItemTagSelectorProps;

export function TagSelector({
  mode,
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
      const newTag = await onCreateTag(searchQuery.trim(), newTagColor);
      // For item mode, auto-select the newly created tag
      if (mode === "item" && newTag) {
        onToggleTag(newTag.id);
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

  const handleDeleteClick = async (e: React.MouseEvent, tagId: string) => {
    e.stopPropagation();
    if (await confirm({
      title: "Delete Tag",
      description: "Are you sure you want to delete this tag globally? This action cannot be undone.",
      variant: "destructive",
      confirmText: "Delete",
    })) {
      onDeleteTag(tagId);
    }
  };

  const colorOptions = Object.keys(swatchColors) as TagColorKey[];

  // Different button styles for global vs item mode
  const TriggerButton = mode === "global" ? (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className="flex items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
    >
      <TagIcon className="h-4 w-4" />
      Tags
      {selectedTagIds.length > 0 && (
        <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
          {selectedTagIds.length}
        </span>
      )}
    </button>
  ) : (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
      }}
      className="flex items-center justify-center text-muted-foreground hover:text-foreground"
      aria-label="Edit tags"
    >
      <TagIcon className="h-5 w-5" />
    </button>
  );

  const stopPropagation = mode === "item" ? (e: React.MouseEvent) => e.stopPropagation() : undefined;

  return (
    <div
      className="relative"
      ref={popoverRef}
      onClick={stopPropagation}
    >
      {TriggerButton}

      {isOpen && (
        <div className={`absolute ${mode === "item" ? "right-0" : "left-0"} top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-2 shadow-lg`}>
          {/* Search/Filter Input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={stopPropagation}
            placeholder="Search or create tag..."
            className="mb-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            onKeyDown={(e) => {
              if (mode === "item") e.stopPropagation();
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
                        onClick={stopPropagation}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (mode === "item") e.stopPropagation();
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
                              if (mode === "item") e.stopPropagation();
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
                            if (mode === "item") e.stopPropagation();
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
                            if (mode === "item") e.stopPropagation();
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
                        if (mode === "item") e.stopPropagation();
                        onToggleTag(tag.id);
                      }}
                      className="flex flex-1 items-center gap-2"
                    >
                      <TagBadge tag={tag} />
                    </button>
                    <div className="flex items-center gap-1">
                      {isSelected && (
                        <CheckIcon className="h-4 w-4 text-primary" />
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
                        <EditIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(e, tag.id)}
                        className="md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        aria-label="Delete tag"
                      >
                        <TrashIcon className="h-5 w-5" />
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
                      if (mode === "item") e.stopPropagation();
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
                  if (mode === "item") e.stopPropagation();
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
