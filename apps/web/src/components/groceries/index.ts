// Main component
export { GroceryList } from "./grocery-list";

// Types
export type { GroceryItemWithTags, OptimisticAction } from "./types";

// Sub-components
export { GroceryItemRow } from "./grocery-item";
export { HistorySection } from "./history-section";
export { TagSelector } from "./tag-selector";
export { TagBadge } from "./tag-badge";
export { DatePickerModal } from "./date-picker-modal";

// Icons
export {
  ChevronDownIcon,
  ChevronRightIcon,
  TagIcon,
  CheckIcon,
  EditIcon,
  TrashIcon,
} from "./grocery-icons";

// Constants and utilities
export {
  tagColors,
  swatchColors,
  formatHistoryDate,
  type TagColorKey,
} from "./constants";

// Hooks
export { useGroceryLogic } from "./use-grocery-logic";
