import { useState, useRef, useEffect, useId } from "react";
import type { GroceryTag } from "@amigo/db";
import { tagColors, swatchColors, type TagColorKey } from "./constants";

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
        {selectedTags.map((tag) => {
          const colorKey = (
            tag.color in tagColors ? tag.color : "gray"
          ) as TagColorKey;
          const colors = tagColors[colorKey];
          return (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                className="relative ml-0.5 rounded-full before:absolute before:-inset-2 before:content-[''] hover:opacity-70"
                aria-label={`Remove ${tag.name}`}
              >
                &times;
              </button>
            </span>
          );
        })}
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
            selectedTags.length > 0 ? "Add tag..." : "Tags (optional)..."
          }
          className="min-w-[100px] flex-1 bg-transparent py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      {/* Autocomplete dropdown */}
      {isOpen && (options.length > 0 || canCreate) && (
        <div
          ref={dropdownRef}
          className="absolute left-0 z-50 mt-1 w-full min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {options.length > 0 && (
            <div
              id={listboxId}
              role="listbox"
              className="max-h-48 overflow-y-auto"
            >
              {options.map((tag, index) => {
                const colorKey = (
                  tag.color in tagColors ? tag.color : "gray"
                ) as TagColorKey;
                const colors = tagColors[colorKey];
                return (
                  <button
                    key={tag.id}
                    type="button"
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={highlightIndex === index}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectExistingTag(tag)}
                    onMouseEnter={() => setHighlightIndex(index)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      highlightIndex === index
                        ? "bg-accent"
                        : "hover:bg-accent"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
                    >
                      {tag.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Create-tag controls: outside the listbox, plain buttons */}
          {canCreate && (
            <div className="rounded-md px-2 py-1.5 hover:bg-accent">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCreate}
                disabled={isCreating}
                className="flex w-full items-center gap-2 text-left text-sm disabled:opacity-50"
              >
                {isCreating ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                ) : (
                  <span className="text-muted-foreground">+</span>
                )}
                <span>
                  Create &ldquo;{search.trim()}&rdquo;
                </span>
              </button>
              <div className="mt-1 flex flex-wrap gap-1 pl-6">
                {(Object.keys(swatchColors) as TagColorKey[]).map(
                  (color) => (
                    <button
                      key={color}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setNewColor(color)}
                      aria-label={`Color ${color}`}
                      aria-pressed={newColor === color}
                      className={`relative h-4 w-4 rounded-full before:absolute before:-inset-2 before:content-[''] ${swatchColors[color]} ${
                        newColor === color
                          ? "ring-2 ring-ring ring-offset-1 ring-offset-background"
                          : ""
                      }`}
                    />
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
