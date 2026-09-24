import { useState, useRef, useEffect, useId } from "react";
import type { GroceryTag } from "@amigo/db";
import { Plus, X } from "lucide-react";
import { cn } from "@/app/lib/utils";
import type { TagColorKey } from "./constants";
import { TagBadge, TagDot } from "./tag-badge";
import { TagColorPicker } from "./tag-color-picker";

interface TagInputProps {
  allTags: GroceryTag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string, color: string) => Promise<GroceryTag | undefined>;
}

export function TagInput({
  allTags,
  selectedTagIds,
  onToggleTag,
  onCreateTag,
}: TagInputProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [newColor, setNewColor] = useState<TagColorKey>("blue");
  const [isCreating, setIsCreating] = useState(false);
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredTags = allTags.filter(
    (tag) =>
      tag.name.toLowerCase().includes(search.toLowerCase()) &&
      !selectedTagIds.includes(tag.id)
  );

  const canCreate =
    search.trim().length > 0 &&
    !allTags.some(
      (t) => t.name.toLowerCase() === search.trim().toLowerCase()
    );

  // Only real tags are listbox options; the create-tag controls live
  // outside the listbox and are not part of highlight navigation.
  const options = filteredTags;

  // Reset highlight when options change
  useEffect(() => {
    setHighlightIndex(-1);
  }, [search]);

  function handleFocus() {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setIsOpen(true);
  }

  function handleBlur() {
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setHighlightIndex(-1);
    }, 200);
  }

  function selectExistingTag(tag: GroceryTag) {
    onToggleTag(tag.id);
    setSearch("");
    inputRef.current?.focus();
  }

  async function handleCreate() {
    const name = search.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    try {
      const tag = await onCreateTag(name, newColor);
      if (tag) {
        onToggleTag(tag.id);
      }
      setSearch("");
      setNewColor("blue");
    } finally {
      setIsCreating(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || (options.length === 0 && !canCreate)) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (options.length === 0) return;
      setHighlightIndex((prev) =>
        prev < options.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (options.length === 0) return;
      setHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : options.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < options.length) {
        selectExistingTag(options[highlightIndex]!);
      } else if (canCreate) {
        handleCreate();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightIndex(-1);
    }
  }

  function removeTag(tagId: string) {
    onToggleTag(tagId);
  }

  const selectedTags = selectedTagIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter(Boolean) as GroceryTag[];

  return (
    <div className="relative">
      {/* Tag chips + input row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1.5 rounded-md border border-border py-0.5 pl-2 pr-1 text-xs font-semibold"
          >
            <TagDot color={tag.color} />
            {tag.name}
            <button
              type="button"
              onClick={() => removeTag(tag.id)}
              className="relative rounded-xs p-0.5 text-muted-foreground before:absolute before:-inset-2 before:content-[''] hover:text-foreground"
              aria-label={`Remove ${tag.name}`}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={isOpen && (options.length > 0 || canCreate)}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlightIndex >= 0 ? `${listboxId}-option-${highlightIndex}` : undefined
          }
          aria-label="Search or create a tag"
          placeholder={
            selectedTags.length > 0 ? "Add a tag" : "Tags (optional)"
          }
          className="min-w-[100px] flex-1 border-b border-transparent bg-transparent py-1 text-base text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
        />
      </div>

      {/* Autocomplete dropdown */}
      {isOpen && (options.length > 0 || canCreate) && (
        <div
          ref={dropdownRef}
          className="absolute left-0 z-50 mt-1 w-full min-w-[200px] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {options.length > 0 && (
            <div
              id={listboxId}
              role="listbox"
              className="max-h-48 overflow-y-auto"
            >
              {options.map((tag, index) => (
                <button
                  key={tag.id}
                  type="button"
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={highlightIndex === index}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectExistingTag(tag)}
                  onMouseEnter={() => setHighlightIndex(index)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                    highlightIndex === index ? "bg-secondary" : "hover:bg-secondary"
                  )}
                >
                  <TagBadge tag={tag} />
                </button>
              ))}
            </div>
          )}

          {/* Create-tag controls: outside the listbox, plain buttons */}
          {canCreate && (
            <div className="px-2 py-2">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCreate}
                disabled={isCreating}
                className="flex w-full min-w-0 items-center gap-2 text-left text-sm font-semibold disabled:opacity-50"
              >
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">
                  {isCreating ? "Creating…" : <>Create &ldquo;{search.trim()}&rdquo;</>}
                </span>
              </button>
              <TagColorPicker
                value={newColor}
                onChange={setNewColor}
                className="mt-3 pl-6"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
