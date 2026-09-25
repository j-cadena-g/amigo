import { listCategoriesForSelect } from "@/app/components/financial/use-financial-categories";
import { NativeSelect } from "@/app/components/financial/form-controls";
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
    <NativeSelect
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>
      {options.map(({ category, indent }) => (
        <option key={category.id} value={category.id}>
          {indent ? "\u00A0\u00A0" : ""}
          {category.icon ? `${category.icon} ` : ""}
          {category.name}
        </option>
      ))}
    </NativeSelect>
  );
}
