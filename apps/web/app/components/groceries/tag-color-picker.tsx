import { cn } from "@/app/lib/utils";
import { tagColors, type TagColorKey } from "./constants";
import { useT } from "@/app/i18n";

const COLOR_KEYS = Object.keys(tagColors) as TagColorKey[];

interface TagColorPickerProps {
  value: TagColorKey;
  onChange: (color: TagColorKey) => void;
  className?: string;
}

export function TagColorPicker({ value, onChange, className }: TagColorPickerProps) {
  const t = useT();
  return (
    <div className={cn("grid w-fit grid-cols-8 gap-3", className)}>
      {COLOR_KEYS.map((color) => (
        <button
          key={color}
          type="button"
          // Keeps focus in the tag input's combobox while a color is picked.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(color)}
          aria-label={t.groceries.tags.color(t.groceries.tags.colors[color])}
          title={t.groceries.tags.colors[color]}
          aria-pressed={value === color}
          className={cn(
            "relative h-6 w-6 rounded-sm before:absolute before:-inset-2 before:content-['']",
            tagColors[color],
            value === color && "ring-2 ring-ring ring-offset-2 ring-offset-background"
          )}
        />
      ))}
    </div>
  );
}
