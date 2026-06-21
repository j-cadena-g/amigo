import { groupCategoriesForSelect } from "@/app/components/financial/use-financial-categories";
import type {
  FinancialCategoryItem,
  FinancialCategoryType,
} from "@/app/lib/financial-category-types";

interface CategorySelectProps {
  value: string;
  onChange: (categoryId: string) => void;
  type: FinancialCategoryType;
  categories: FinancialCategoryItem[];
  disabled?: boolean;
  placeholder?: string;
}

export function CategorySelect({
  value,
  onChange,
  type,
  categories,
  disabled,
  placeholder = "Select category",
}: CategorySelectProps) {
  const groups = groupCategoriesForSelect(categories, type);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      <option value="">{placeholder}</option>
      {groups.map((group) =>
        group.label ? (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icon ? `${category.icon} ` : ""}
                {category.name}
              </option>
            ))}
          </optgroup>
        ) : (
          group.options.map((category) => (
            <option key={category.id} value={category.id}>
              {category.icon ? `${category.icon} ` : ""}
              {category.name}
            </option>
          ))
        )
      )}
    </select>
  );
}
