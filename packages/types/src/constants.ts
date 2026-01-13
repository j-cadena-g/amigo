/**
 * Shared constants for the Amigo application
 */

/** Default category for grocery items when none is specified */
export const DEFAULT_GROCERY_CATEGORY = "Uncategorized" as const;

/** Default category for transactions when none is specified */
export const DEFAULT_TRANSACTION_CATEGORY = "Uncategorized" as const;

/** Valid tag colors for grocery tags */
export const TAG_COLORS = [
  "blue",
  "green",
  "red",
  "yellow",
  "purple",
  "pink",
  "orange",
  "gray",
] as const;

export type TagColor = (typeof TAG_COLORS)[number];
