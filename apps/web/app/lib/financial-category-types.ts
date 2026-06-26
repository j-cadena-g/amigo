export type FinancialCategoryType = "income" | "expense";

export interface FinancialCategoryItem {
  id: string;
  householdId: string;
  parentId: string | null;
  name: string;
  type: FinancialCategoryType;
  icon: string | null;
  sortOrder: number;
  archived: boolean;
  hasChildren: boolean;
  selectable: boolean;
}

export interface CategoryBudgetMappingRow {
  categoryId: string;
  budgetId: string | null;
}
