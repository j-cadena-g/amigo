import { listCategoriesForSelect } from "@/app/components/financial/use-financial-categories";
import type {
  FinancialCategoryItem,
  FinancialCategoryType,
} from "@/app/lib/financial-category-types";

interface CategorySelectProps {
  id?: string;
  value: string;
  onChange: (categoryId: string) => void;
  type: FinancialCategoryType;
  categories: FinancialCategoryItem[];
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}

export function CategorySelect({
  id,
  value,
  onChange,
  type,
  categories,
  disabled,
  placeholder = "Select category",
  "aria-label": ariaLabel,
}: CategorySelectProps) {
  const options = listCategoriesForSelect(categories, type);

  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map(({ category, indent }) => (
        <option key={category.id} value={category.id}>
          {indent ? "\u00A0\u00A0" : ""}
          {category.icon ? `${category.icon} ` : ""}
          {category.name}
        </option>
      ))}
    </select>
  );
}
