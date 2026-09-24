import { useState, useRef, useEffect, useId } from "react";
import type { GroceryTag } from "@amigo/db";
import { Check, Pencil, Tag } from "lucide-react";
import { useConfirm } from "@/app/components/confirm-provider";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/lib/utils";
import { tagColorKey, type TagColorKey } from "./constants";
import { TagBadge } from "./tag-badge";
import { TagColorPicker } from "./tag-color-picker";

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
  /** Names the icon-only trigger in item mode. */
  itemName?: string;
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
  itemName,
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
        buttonRef.current?.focus();
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

  const activeFilterCount = filterTagIds?.length ?? 0;

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
      title: "Delete this tag?",
      description: "It will be removed from every item on the list.",
      confirmText: "Delete tag",
      cancelText: "Cancel",
      variant: "destructive",
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
    setEditColor(tagColorKey(tag.color));
  }

  return (
    <div className="relative inline-block">
      {mode === "global" ? (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={popoverId}
          className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Tag className="h-4 w-4" aria-hidden="true" />
          Filter by tag
          {activeFilterCount > 0 && (
            <span className="font-mono text-foreground">({activeFilterCount})</span>
          )}
        </button>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={popoverId}
          aria-label={itemName ? `Tags for ${itemName}` : "Tags"}
          className="relative flex rounded-md p-1 text-muted-foreground before:absolute before:-inset-2 before:content-[''] hover:bg-secondary hover:text-foreground"
        >
          <Tag className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {isOpen && (
        <div
          ref={popoverRef}
          id={popoverId}
          className={cn(
            "absolute z-50 mt-1 w-72 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg",
            mode === "item" ? "right-0" : "left-0"
          )}
        >
          {editingTag ? (
            <div className="space-y-3">
              <h4 className="font-semibold">Edit tag</h4>
              <Input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                aria-label="Tag name"
                autoFocus
              />
              <TagColorPicker value={editColor} onChange={setEditColor} />
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(editingTag.id)}
                  className="-ml-3 text-destructive hover:text-destructive"
                >
                  Delete
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingTag(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleEditSave}
                    disabled={!editName.trim()}
                  >
                    Save tag
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <Input
                type="text"
                placeholder="Search or create a tag"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreate && !isCreating) handleCreate();
                }}
                aria-label="Search or create a tag"
                autoFocus
              />

              {canCreate && (
                <div className="mt-3 space-y-3">
                  <TagColorPicker value={newColor} onChange={setNewColor} />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreate}
                    disabled={isCreating}
                    className="w-full"
                  >
                    <span className="min-w-0 truncate">
                      {isCreating ? "Creating…" : <>Create &ldquo;{search.trim()}&rdquo;</>}
                    </span>
                  </Button>
                </div>
              )}

              <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
                {filteredTags.map((tag) => {
                  const isSelected =
                    mode === "item"
                      ? selectedTagIds.includes(tag.id)
                      : Boolean(filterTagIds?.includes(tag.id));
                  return (
                    <li
                      key={tag.id}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-secondary"
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
                        aria-pressed={isSelected}
                        className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                            isSelected
                              ? "border-foreground bg-foreground text-background"
                              : "border-input"
                          )}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                          )}
                        </span>
                        <TagBadge tag={tag} />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(tag)}
                        aria-label={`Edit tag ${tag.name}`}
                        className="relative rounded-md p-1 text-muted-foreground before:absolute before:-inset-2 before:content-[''] hover:bg-background hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {filteredTags.length === 0 && !canCreate && (
                <p className="py-2 text-sm text-muted-foreground">
                  No tags yet. Type a name to create one.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
