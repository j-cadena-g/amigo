import { useEffect, useId, type Dispatch, type FormEvent, type MutableRefObject, type SetStateAction } from "react";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { BudgetSelect } from "@/app/components/budget-select";
import { CategorySelect } from "@/app/components/financial/category-select";
import { useFinancialCategories } from "@/app/components/financial/use-financial-categories";
import { CurrencySelect } from "@/app/components/currency-select";
import { isPositiveDecimal, parseDecimalInput } from "@/app/lib/decimal-input";
import type { CurrencyCode } from "@amigo/db";
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";

export interface TransactionFormState {
  amount: string;
  description: string;
  categoryId: string;
  type: "income" | "expense";
  date: string;
  budgetId: string | null;
  currency: CurrencyCode;
}

interface AddTransactionFormProps {
  form: TransactionFormState;
  isSubmitting: boolean;
  formError: string | null;
  allowBudgetSuggest: boolean;
  lastExpenseBudgetIdRef: MutableRefObject<string | null>;
  onChange: Dispatch<SetStateAction<TransactionFormState>>;
  onAllowBudgetSuggestChange: (allow: boolean) => void;
  onCancel: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function AddTransactionForm({
  form,
  isSubmitting,
  formError,
  allowBudgetSuggest,
  lastExpenseBudgetIdRef,
  onChange,
  onAllowBudgetSuggestChange,
  onCancel,
  onSubmit,
}: AddTransactionFormProps) {
  const categoryFieldId = useId();
  const budgetFieldId = useId();
  const { categories } = useFinancialCategories();

  useEffect(() => {
    if (form.type !== "expense" || !allowBudgetSuggest || !form.categoryId) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/budgets/match-category?${new URLSearchParams({
              categoryId: form.categoryId,
            })}`,
            { signal: ac.signal }
          );
          if (!res.ok) return;
          const data = (await res.json()) as { budgetId: string | null };
          onChange((p) => ({ ...p, budgetId: data.budgetId ?? null }));
        } catch {
          /* aborted */
        }
      })();
    }, 200);
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [form.categoryId, form.type, allowBudgetSuggest, onChange]);

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border bg-card p-4 space-y-3"
    >
      <div className="flex gap-2" role="radiogroup" aria-label="Transaction type">
        <button
          type="button"
          role="radio"
          aria-checked={form.type === "expense"}
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              type: "expense",
              categoryId: "",
              budgetId:
                prev.type === "income"
                  ? lastExpenseBudgetIdRef.current
                  : prev.budgetId,
            }))
          }
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            form.type === "expense"
              ? "bg-destructive/10 text-destructive"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={form.type === "income"}
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              type: "income",
              categoryId: "",
              budgetId: null,
            }))
          }
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            form.type === "income"
              ? "bg-success/10 text-success"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          Income
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Input
          type="text"
          inputMode="decimal"
          placeholder="Amount"
          aria-label="Amount"
          value={form.amount}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              amount: parseDecimalInput(e.target.value),
            }))
          }
          className="col-span-2 min-w-0"
          required
        />
        <CurrencySelect
          compact
          value={form.currency}
          onChange={(v) =>
            onChange((prev) => ({ ...prev, currency: v as CurrencyCode }))
          }
        />
        <Input
          type="date"
          aria-label="Date"
          value={form.date}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              date: e.target.value,
            }))
          }
          required
        />
      </div>

      <Input
        type="text"
        placeholder="Description"
        aria-label="Description"
        value={form.description}
        onChange={(e) =>
          onChange((prev) => ({
            ...prev,
            description: e.target.value,
          }))
        }
      />

      <div>
        <label htmlFor={categoryFieldId} className="text-sm text-muted-foreground mb-1 block">
          Category
        </label>
        <CategorySelect
          id={categoryFieldId}
          value={form.categoryId}
          onChange={(categoryId) => {
            onAllowBudgetSuggestChange(true);
            onChange((prev) => ({ ...prev, categoryId }));
          }}
          type={form.type}
          categories={categories}
        />
      </div>

      {form.type === "expense" && (
        <div>
          <label htmlFor={budgetFieldId} className="text-sm text-muted-foreground mb-1 block">
            Budget (optional)
          </label>
          <BudgetSelect
            id={budgetFieldId}
            value={form.budgetId}
            onChange={(budgetId) => {
              onAllowBudgetSuggestChange(false);
              onChange((prev) => ({ ...prev, budgetId }));
            }}
          />
        </div>
      )}

      {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}

      <p className="text-sm text-muted-foreground">
        Need this on a schedule?{" "}
        <Link to="/financial/recurring" className="font-medium text-primary hover:underline">
          Set up a recurring transaction
        </Link>
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1 text-muted-foreground"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            isSubmitting || !isPositiveDecimal(form.amount) || !form.categoryId
          }
          className="flex-1"
        >
          {isSubmitting ? "Adding..." : "Add"}
        </Button>
      </div>
    </form>
  );
}

interface EditTransactionFormProps {
  form: TransactionFormState;
  isSubmitting: boolean;
  lastExpenseBudgetIdRef: MutableRefObject<string | null>;
  onChange: Dispatch<SetStateAction<TransactionFormState>>;
  onCancel: () => void;
  onSubmit: (e: FormEvent) => void;
  recordId?: string;
}

export function EditTransactionForm({
  form,
  isSubmitting,
  lastExpenseBudgetIdRef,
  onChange,
  onCancel,
  onSubmit,
  recordId,
}: EditTransactionFormProps) {
  const categoryFieldId = useId();
  const budgetFieldId = useId();
  const { categories } = useFinancialCategories();

  return (
    <form onSubmit={onSubmit} className="p-4 space-y-3">
      <div className="flex gap-2" role="radiogroup" aria-label="Transaction type">
        <button
          type="button"
          role="radio"
          aria-checked={form.type === "expense"}
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              type: "expense",
              categoryId: "",
              budgetId:
                prev.type === "income"
                  ? lastExpenseBudgetIdRef.current
                  : prev.budgetId,
            }))
          }
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            form.type === "expense"
              ? "bg-destructive/10 text-destructive"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={form.type === "income"}
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              type: "income",
              categoryId: "",
              budgetId: null,
            }))
          }
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            form.type === "income"
              ? "bg-success/10 text-success"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          Income
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Input
          type="text"
          inputMode="decimal"
          placeholder="Amount"
          aria-label="Amount"
          value={form.amount}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              amount: parseDecimalInput(e.target.value),
            }))
          }
          className="col-span-2"
          required
        />
        <CurrencySelect
          value={form.currency}
          onChange={(v) =>
            onChange((prev) => ({ ...prev, currency: v as CurrencyCode }))
          }
        />
        <Input
          type="date"
          aria-label="Date"
          value={form.date}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              date: e.target.value,
            }))
          }
          required
        />
      </div>

      <Input
        type="text"
        placeholder="Description"
        aria-label="Description"
        value={form.description}
        onChange={(e) =>
          onChange((prev) => ({
            ...prev,
            description: e.target.value,
          }))
        }
      />

      <div>
        <label htmlFor={categoryFieldId} className="text-sm text-muted-foreground mb-1 block">
          Category
        </label>
        <CategorySelect
          id={categoryFieldId}
          value={form.categoryId}
          onChange={(categoryId) => onChange((prev) => ({ ...prev, categoryId }))}
          type={form.type}
          categories={categories}
        />
      </div>

      {form.type === "expense" && (
        <div>
          <label htmlFor={budgetFieldId} className="text-sm text-muted-foreground mb-1 block">
            Budget (optional)
          </label>
          <BudgetSelect
            id={budgetFieldId}
            value={form.budgetId}
            onChange={(budgetId) => onChange((prev) => ({ ...prev, budgetId }))}
          />
        </div>
      )}

      {recordId ? (
        <AuditHistoryPanel recordId={recordId} table="transactions" />
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1 text-muted-foreground"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            isSubmitting || !isPositiveDecimal(form.amount) || !form.categoryId
          }
          className="flex-1"
        >
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

interface AddTransactionButtonProps {
  onClick: () => void;
}

export function AddTransactionButton({ onClick }: AddTransactionButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="h-auto w-full border-2 border-dashed border-border py-3 text-muted-foreground hover:border-muted-foreground hover:bg-transparent hover:text-foreground"
    >
      <Plus className="h-5 w-5" />
      Add Transaction
    </Button>
  );
}
