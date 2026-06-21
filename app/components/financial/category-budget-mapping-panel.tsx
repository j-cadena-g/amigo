import { useEffect, useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import {
  buildCategoryTree,
  useFinancialCategories,
} from "@/app/components/financial/use-financial-categories";
import type { CategoryBudgetMappingRow } from "@/app/lib/financial-category-types";
import { parseApiError } from "@/app/lib/parse-api-error";

interface BudgetOption {
  id: string;
  name: string;
  isShared: boolean;
}

export function CategoryBudgetMappingPanel() {
  const { categories, loading: categoriesLoading } = useFinancialCategories();
  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const expenseTree = useMemo(
    () =>
      buildCategoryTree(
        categories.filter((c) => c.type === "expense" && !c.archived)
      ),
    [categories]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [budgetRes, mappingRes] = await Promise.all([
          fetch("/api/budgets"),
          fetch("/api/categories/mappings"),
        ]);
        if (!budgetRes.ok || !mappingRes.ok) {
          throw new Error("Failed to load budget mappings");
        }
        const budgetData = (await budgetRes.json()) as BudgetOption[];
        const mappingData = (await mappingRes.json()) as {
          mappings: CategoryBudgetMappingRow[];
        };
        if (cancelled) return;
        setBudgets(budgetData);
        setMappings(
          Object.fromEntries(
            mappingData.mappings.map((row) => [row.categoryId, row.budgetId])
          )
        );
      } catch {
        if (!cancelled) setFeedback("Could not load category mappings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function setMapping(categoryId: string, budgetId: string | null) {
    setMappings((prev) => ({ ...prev, [categoryId]: budgetId }));
  }

  async function handleSave() {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/categories/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: Object.entries(mappings).map(([categoryId, budgetId]) => ({
            categoryId,
            budgetId,
          })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        setFeedback(parseApiError(body, "Failed to save mappings"));
        return;
      }
      setFeedback("Mappings saved.");
    } catch {
      setFeedback("Network error — could not save mappings");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || categoriesLoading) {
    return <p className="text-sm text-muted-foreground">Loading mappings…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose which budget auto-selects when you log an expense in each category.
        Subcategories override their parent when set.
      </p>

      <div className="space-y-2">
        {expenseTree.map((row) => (
          <div key={row.parent.id} className="space-y-2">
            <MappingRow
              label={row.parent.name}
              categoryId={row.parent.id}
              budgetId={mappings[row.parent.id] ?? null}
              budgets={budgets}
              onChange={setMapping}
              hint={
                row.children.length > 0
                  ? "Default for unmapped subcategories"
                  : undefined
              }
            />
            {row.children.map((child) => (
              <MappingRow
                key={child.id}
                label={child.name}
                categoryId={child.id}
                budgetId={mappings[child.id] ?? null}
                budgets={budgets}
                onChange={setMapping}
                nested
              />
            ))}
          </div>
        ))}
      </div>

      <Button type="button" size="sm" disabled={submitting} onClick={() => void handleSave()}>
        Save mappings
      </Button>

      {feedback ? (
        <p
          className={`text-sm ${
            feedback === "Mappings saved." ? "text-muted-foreground" : "text-destructive"
          }`}
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}

function MappingRow({
  label,
  categoryId,
  budgetId,
  budgets,
  onChange,
  nested,
  hint,
}: {
  label: string;
  categoryId: string;
  budgetId: string | null;
  budgets: BudgetOption[];
  onChange: (categoryId: string, budgetId: string | null) => void;
  nested?: boolean;
  hint?: string;
}) {
  const selectId = `budget-mapping-${categoryId}`;

  return (
    <div className={`grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] ${nested ? "ml-4" : ""}`}>
      <div>
        <label htmlFor={selectId} className="text-sm font-medium">
          {label}
        </label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <select
        id={selectId}
        value={budgetId ?? ""}
        onChange={(e) => onChange(categoryId, e.target.value || null)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">No budget</option>
        {budgets.map((budget) => (
          <option key={budget.id} value={budget.id}>
            {budget.name}
            {budget.isShared ? " (shared)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
