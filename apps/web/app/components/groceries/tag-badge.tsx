import type { GroceryTag } from "@amigo/db";
import { cn } from "@/app/lib/utils";
import { tagColorKey, tagColors } from "./constants";

export function TagDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-xs",
        tagColors[tagColorKey(color)],
        className
      )}
    />
  );
}

interface TagBadgeProps {
  tag: GroceryTag;
  className?: string;
}

export function TagBadge({ tag, className }: TagBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground",
        className
      )}
    >
      <TagDot color={tag.color} />
      <span className="min-w-0 truncate">{tag.name}</span>
    </span>
  );
}
