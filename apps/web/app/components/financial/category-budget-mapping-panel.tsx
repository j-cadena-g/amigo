import { useEffect, useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { NativeSelect } from "@/app/components/financial/form-controls";
import {
  buildCategoryTree,
  useFinancialCategories,
} from "@/app/components/financial/use-financial-categories";
import type { CategoryBudgetMappingRow } from "@/app/lib/financial-category-types";
import { parseApiError } from "@/app/lib/parse-api-error";
import { cn } from "@/app/lib/utils";
import { useT } from "@/app/i18n";

interface BudgetOption {
  id: string;
  name: string;
  isShared: boolean;
}

type Feedback = { tone: "success" | "error"; message: string };

export function CategoryBudgetMappingPanel() {
  const t = useT();
  const { categories, loading: categoriesLoading } = useFinancialCategories();
  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

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
        if (!cancelled) {
          setFeedback({
            tone: "error",
            message: t.categories.links.loadFailed,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

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
        setFeedback({
          tone: "error",
          message: parseApiError(body, t.common.couldNot(t.categories.links.saveAction)),
        });
        return;
      }
      setFeedback({ tone: "success", message: t.categories.links.saved });
    } catch {
      setFeedback({
        tone: "error",
        message: t.common.couldNotConnection(t.categories.links.saveAction),
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || categoriesLoading) {
    return <p className="text-sm text-muted-foreground">{t.categories.links.loading}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.categories.links.override}</p>

      {expenseTree.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.categories.links.noExpenseCategories}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {expenseTree.flatMap((row) => [
            <MappingRow
              key={row.parent.id}
              label={row.parent.name}
              categoryId={row.parent.id}
              budgetId={mappings[row.parent.id] ?? null}
              budgets={budgets}
              onChange={setMapping}
              hint={
                row.children.length > 0
                  ? t.categories.links.parentDefault
                  : undefined
              }
            />,
            ...row.children.map((child) => (
              <MappingRow
                key={child.id}
                label={child.name}
                categoryId={child.id}
                budgetId={mappings[child.id] ?? null}
                budgets={budgets}
                onChange={setMapping}
                nested
              />
            )),
          ])}
        </ul>
      )}

      <Button type="button" size="sm" disabled={submitting} onClick={() => void handleSave()}>
        {submitting ? t.common.saving : t.categories.links.save}
      </Button>

      {feedback ? (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={cn(
            "text-sm",
            feedback.tone === "success" ? "text-muted-foreground" : "text-destructive"
          )}
        >
          {feedback.message}
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
  const t = useT();
  const selectId = `budget-mapping-${categoryId}`;

  return (
    <li
      className={cn(
        "grid grid-cols-1 items-center gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]",
        nested && "pl-5"
      )}
    >
      <div>
        <label htmlFor={selectId} className="text-sm font-semibold">
          {label}
        </label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <NativeSelect
        id={selectId}
        value={budgetId ?? ""}
        onChange={(e) => onChange(categoryId, e.target.value || null)}
      >
        <option value="">{t.transactions.noBudget}</option>
        {budgets.map((budget) => (
          <option key={budget.id} value={budget.id}>
            {budget.name}
            {budget.isShared ? ` ${t.categories.links.shared}` : ""}
          </option>
        ))}
      </NativeSelect>
    </li>
  );
}
