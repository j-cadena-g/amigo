import { useCallback, useEffect, useState } from "react";
import type {
  FinancialCategoryItem,
  FinancialCategoryType,
} from "@/app/lib/financial-category-types";

export function useFinancialCategories(options?: { includeArchived?: boolean }) {
  const [categories, setCategories] = useState<FinancialCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options?.includeArchived) {
        params.set("includeArchived", "true");
      }
      const query = params.toString();
      const res = await fetch(`/api/categories${query ? `?${query}` : ""}`);
      if (!res.ok) {
        throw new Error("Failed to load categories");
      }
      setCategories((await res.json()) as FinancialCategoryItem[]);
    } catch {
      setError("Could not load categories");
    } finally {
      setLoading(false);
    }
  }, [options?.includeArchived]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { categories, loading, error, reload };
}

export function groupCategoriesForSelect(
  categories: FinancialCategoryItem[],
  type: FinancialCategoryType
) {
  const filtered = categories.filter((c) => c.type === type && !c.archived);
  const parents = filtered.filter((c) => c.parentId === null);
  const childrenByParent = new Map<string, FinancialCategoryItem[]>();

  for (const category of filtered) {
    if (!category.parentId) continue;
    const list = childrenByParent.get(category.parentId) ?? [];
    list.push(category);
    childrenByParent.set(category.parentId, list);
  }

  const groups: { label: string | null; options: FinancialCategoryItem[] }[] = [];

  for (const parent of parents) {
    const children = childrenByParent.get(parent.id) ?? [];
    if (children.length > 0) {
      groups.push({ label: parent.name, options: children.filter((c) => c.selectable) });
    } else if (parent.selectable) {
      groups.push({ label: null, options: [parent] });
    }
  }

  return groups;
}

export function buildCategoryTree(categories: FinancialCategoryItem[]) {
  const parents = categories
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const childrenByParent = new Map<string, FinancialCategoryItem[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const list = childrenByParent.get(category.parentId) ?? [];
    list.push(category);
    childrenByParent.set(category.parentId, list);
  }

  return parents.map((parent) => ({
    parent,
    children: (childrenByParent.get(parent.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    ),
  }));
}
