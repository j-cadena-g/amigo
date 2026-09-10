import { useState, useRef, useEffect, useId } from "react";
import type { GroceryTag } from "@amigo/db";
import { useConfirm } from "@/app/components/confirm-provider";
import { tagColors, swatchColors, type TagColorKey } from "./constants";
import { Check, Pencil, Tag, Trash2 } from "lucide-react";

interface TagSelectorProps {
  mode: "global" | "item";
  allTags: GroceryTag[];
  selectedTagIds: string[];
  onToggleTag?: (tagId: string) => void;
  onCreateTag: (name: string, color: string) => Promise<GroceryTag | undefined>;
  onDeleteTag: (tagId: string) => Promise<void>;
  onEditTag: (tagId: string, name: string, color: string) => Promise<void>;
  filterTagIds?: string[];
  onFilterToggle?: (tagId: string) => void;
}

export function TagSelector({
  mode,
  allTags,
  selectedTagIds,
  onToggleTag,
  onCreateTag,
  onDeleteTag,
  onEditTag,
  filterTagIds,
  onFilterToggle,
}: TagSelectorProps) {
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newColor, setNewColor] = useState<TagColorKey>("blue");
  const [isCreating, setIsCreating] = useState(false);
  const [editingTag, setEditingTag] = useState<GroceryTag | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<TagColorKey>("blue");
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setEditingTag(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setEditingTag(null);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen]);

  const filteredTags = allTags.filter((tag) =>
    tag.name.toLowerCase().includes(search.toLowerCase())
  );

  const canCreate =
    search.trim().length > 0 &&
    !allTags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  async function handleCreate() {
    const name = search.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    try {
      const tag = await onCreateTag(name, newColor);
      if (tag && onToggleTag) {
        onToggleTag(tag.id);
      }
      setSearch("");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(tagId: string) {
    const ok = await confirm({
      title: "Delete Tag",
      description: "This will remove the tag from all grocery items. Are you sure?",
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    if (ok) {
      await onDeleteTag(tagId);
      setEditingTag(null);
    }
  }

  async function handleEditSave() {
    if (!editingTag) return;
    await onEditTag(editingTag.id, editName, editColor);
    setEditingTag(null);
  }

  function startEdit(tag: GroceryTag) {
    setEditingTag(tag);
    setEditName(tag.name);
    setEditColor((tag.color as TagColorKey) || "gray");
  }

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={popoverId}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
      >
        <Tag className="h-3.5 w-3.5" />
        {mode === "global" ? "Filter Tags" : "Tags"}
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          id={popoverId}
          className="absolute left-0 z-50 mt-1 w-64 rounded-lg border border-border bg-popover p-3 shadow-lg"
        >
          {editingTag ? (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-popover-foreground">Edit Tag</h4>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                aria-label="Tag name"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(swatchColors) as TagColorKey[]).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditColor(color)}
                    aria-label={`Color ${color}`}
                    aria-pressed={editColor === color}
                    className={`relative h-6 w-6 rounded-full before:absolute before:-inset-2 before:content-[''] ${swatchColors[color]} ${
                      editColor === color ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""
                    }`}
                  />
                ))}
              </div>
              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => handleDelete(editingTag.id)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTag(null)}
                    className="inline-flex min-h-9 items-center rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleEditSave}
                    className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Search or create tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreate && !isCreating) handleCreate();
                }}
                aria-label="Search or create a tag"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />

              {canCreate && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(swatchColors) as TagColorKey[]).map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewColor(color)}
                        aria-label={`Color ${color}`}
                        aria-pressed={newColor === color}
                        className={`relative h-5 w-5 rounded-full before:absolute before:-inset-2 before:content-[''] ${swatchColors[color]} ${
                          newColor === color ? "ring-2 ring-ring ring-offset-1 ring-offset-background" : ""
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={isCreating}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isCreating && (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    )}
                    Create &quot;{search.trim()}&quot;
                  </button>
                </div>
              )}

              <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
                {filteredTags.map((tag) => {
                  const isSelected = mode === "item"
                    ? selectedTagIds.includes(tag.id)
                    : filterTagIds?.includes(tag.id);
                  const colorKey = (tag.color in tagColors ? tag.color : "gray") as TagColorKey;
                  const colors = tagColors[colorKey];

                  return (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (mode === "item" && onToggleTag) {
                            onToggleTag(tag.id);
                          } else if (mode === "global" && onFilterToggle) {
                            onFilterToggle(tag.id);
                          }
                        }}
                        className="flex flex-1 items-center gap-2"
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            isSelected
                              ? "border-primary bg-primary"
                              : "border-input"
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
                          {tag.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(tag)}
                        aria-label={`Edit tag ${tag.name}`}
                        className="relative rounded p-1 text-muted-foreground before:absolute before:-inset-2 before:content-[''] hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
                {filteredTags.length === 0 && !canCreate && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    No tags found
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
