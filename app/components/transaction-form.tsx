import { useEffect, type Dispatch, type FormEvent, type MutableRefObject, type SetStateAction } from "react";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { BudgetSelect } from "@/app/components/budget-select";
import { CurrencySelect } from "@/app/components/currency-select";
import { isPositiveDecimal, sanitizeDecimalInput } from "@/app/lib/decimal-input";
import type { CurrencyCode } from "@amigo/db";

export interface TransactionFormState {
  amount: string;
  description: string;
  category: string;
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
  useEffect(() => {
    if (form.type !== "expense" || !allowBudgetSuggest) return;
    const cat = form.category.trim();
    if (cat.length < 2) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/budgets/match-category?${new URLSearchParams({ category: cat })}`,
            { signal: ac.signal }
          );
          if (!res.ok) return;
          const data = (await res.json()) as { budgetId: string | null };
          if (!data.budgetId) return;
          onChange((p) => ({ ...p, budgetId: data.budgetId }));
        } catch {
          /* aborted */
        }
      })();
    }, 400);
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [form.category, form.type, allowBudgetSuggest, onChange]);

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border bg-card p-4 space-y-3"
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              type: "expense",
              budgetId:
                prev.type === "income"
                  ? lastExpenseBudgetIdRef.current
                  : prev.budgetId,
            }))
          }
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            form.type === "expense"
              ? "bg-red-500/10 text-red-600 dark:text-red-400"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              type: "income",
              budgetId: null,
            }))
          }
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            form.type === "income"
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          Income
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount"
          aria-label="Amount"
          value={form.amount}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              amount: sanitizeDecimalInput(e.target.value),
            }))
          }
          className="col-span-2 min-w-0 rounded-md border border-input bg-background px-3 py-2"
          required
        />
        <CurrencySelect
          compact
          value={form.currency}
          onChange={(v) =>
            onChange((prev) => ({ ...prev, currency: v as CurrencyCode }))
          }
        />
        <input
          type="date"
          aria-label="Date"
          value={form.date}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              date: e.target.value,
            }))
          }
          className="rounded-md border border-input bg-background px-3 py-2"
          required
        />
      </div>

      <input
        type="text"
        placeholder="Description"
        value={form.description}
        onChange={(e) =>
          onChange((prev) => ({
            ...prev,
            description: e.target.value,
          }))
        }
        className="w-full rounded-md border border-input bg-background px-3 py-2"
      />

      <input
        type="text"
        placeholder="Category"
        value={form.category}
        onChange={(e) =>
          onChange((prev) => ({
            ...prev,
            category: e.target.value,
          }))
        }
        className="w-full rounded-md border border-input bg-background px-3 py-2"
      />

      {form.type === "expense" && (
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">
            Budget (optional)
          </label>
          <BudgetSelect
            value={form.budgetId}
            onChange={(budgetId) => {
              onAllowBudgetSuggestChange(false);
              onChange((prev) => ({ ...prev, budgetId }));
            }}
          />
        </div>
      )}

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <p className="text-sm text-muted-foreground">
        Need this on a schedule?{" "}
        <Link to="/budget/recurring" className="font-medium text-primary hover:underline">
          Set up a recurring transaction
        </Link>
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-input px-3 py-2 text-muted-foreground hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !isPositiveDecimal(form.amount)}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? "Adding..." : "Add"}
        </button>
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
}

export function EditTransactionForm({
  form,
  isSubmitting,
  lastExpenseBudgetIdRef,
  onChange,
  onCancel,
  onSubmit,
}: EditTransactionFormProps) {
  return (
    <form onSubmit={onSubmit} className="p-4 space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              type: "expense",
              budgetId:
                prev.type === "income"
                  ? lastExpenseBudgetIdRef.current
                  : prev.budgetId,
            }))
          }
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            form.type === "expense"
              ? "bg-red-500/10 text-red-600 dark:text-red-400"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              type: "income",
              budgetId: null,
            }))
          }
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            form.type === "income"
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          Income
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount"
          aria-label="Amount"
          value={form.amount}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              amount: sanitizeDecimalInput(e.target.value),
            }))
          }
          className="col-span-2 rounded-md border border-input bg-background px-3 py-2"
          required
        />
        <CurrencySelect
          value={form.currency}
          onChange={(v) =>
            onChange((prev) => ({ ...prev, currency: v as CurrencyCode }))
          }
        />
        <input
          type="date"
          aria-label="Date"
          value={form.date}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              date: e.target.value,
            }))
          }
          className="rounded-md border border-input bg-background px-3 py-2"
          required
        />
      </div>

      <input
        type="text"
        placeholder="Description"
        value={form.description}
        onChange={(e) =>
          onChange((prev) => ({
            ...prev,
            description: e.target.value,
          }))
        }
        className="w-full rounded-md border border-input bg-background px-3 py-2"
      />

      <input
        type="text"
        placeholder="Category"
        value={form.category}
        onChange={(e) =>
          onChange((prev) => ({
            ...prev,
            category: e.target.value,
          }))
        }
        className="w-full rounded-md border border-input bg-background px-3 py-2"
        required
      />

      {form.type === "expense" && (
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">
            Budget (optional)
          </label>
          <BudgetSelect
            value={form.budgetId}
            onChange={(budgetId) => onChange((prev) => ({ ...prev, budgetId }))}
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-input px-3 py-2 text-muted-foreground hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !isPositiveDecimal(form.amount)}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

interface AddTransactionButtonProps {
  onClick: () => void;
}

export function AddTransactionButton({ onClick }: AddTransactionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-muted-foreground hover:border-muted-foreground hover:text-foreground"
    >
      <Plus className="h-5 w-5" />
      Add Transaction
    </button>
  );
}
