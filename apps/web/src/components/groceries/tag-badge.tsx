import type { GroceryTag } from "@amigo/db";
import { tagColors, type TagColorKey } from "./constants";

interface TagBadgeProps {
  tag: GroceryTag;
}

export function TagBadge({ tag }: TagBadgeProps) {
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
