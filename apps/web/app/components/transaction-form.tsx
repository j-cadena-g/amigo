import {
  useEffect,
  useId,
  type Dispatch,
  type FormEvent,
  type MutableRefObject,
  type Ref,
  type SetStateAction,
} from "react";
import type { CurrencyCode } from "@amigo/db";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { BudgetSelect } from "@/app/components/budget-select";
import { CategorySelect } from "@/app/components/financial/category-select";
import { useFinancialCategories } from "@/app/components/financial/use-financial-categories";
import { CurrencySelect } from "@/app/components/currency-select";
import { SectionLink } from "@/app/components/ledger";
import { TypeToggle } from "@/app/components/type-toggle";
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";
import { isPositiveDecimal, parseDecimalInput } from "@/app/lib/decimal-input";

const TRANSACTION_TYPE_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const;

export interface TransactionFormState {
  amount: string;
  description: string;
  categoryId: string;
  type: "income" | "expense";
  date: string;
  budgetId: string | null;
  currency: CurrencyCode;
}

interface TransactionFieldsProps {
  form: TransactionFormState;
  lastExpenseBudgetIdRef: MutableRefObject<string | null>;
  onChange: Dispatch<SetStateAction<TransactionFormState>>;
  onCategoryChange: (categoryId: string) => void;
  onBudgetChange: (budgetId: string | null) => void;
  amountRef?: Ref<HTMLInputElement>;
}

function TransactionFields({
  form,
  lastExpenseBudgetIdRef,
  onChange,
  onCategoryChange,
  onBudgetChange,
  amountRef,
}: TransactionFieldsProps) {
  const amountId = useId();
  const currencyId = useId();
  const dateId = useId();
  const descriptionId = useId();
  const categoryFieldId = useId();
  const budgetFieldId = useId();
  const { categories } = useFinancialCategories();

  const selectType = (type: "income" | "expense") =>
    onChange((prev) => {
      if (type === prev.type) return prev;
      return {
        ...prev,
        type,
        categoryId: "",
        budgetId:
          type === "income"
            ? null
            : prev.type === "income"
              ? lastExpenseBudgetIdRef.current
              : prev.budgetId,
      };
    });

  return (
    <>
      <TypeToggle
        label="Transaction type"
        options={TRANSACTION_TYPE_OPTIONS}
        value={form.type}
        onChange={selectType}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_5.75rem] gap-3 sm:grid-cols-[minmax(0,1fr)_5.75rem_minmax(0,11rem)]">
        <div className="space-y-1.5">
          <label htmlFor={amountId} className="text-sm font-semibold">
            Amount
          </label>
          <Input
            id={amountId}
            ref={amountRef}
            autoFocus
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                amount: parseDecimalInput(e.target.value),
              }))
            }
            className="font-mono font-medium"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={currencyId} className="text-sm font-semibold">
            Currency
          </label>
          <CurrencySelect
            id={currencyId}
            compact
            value={form.currency}
            onChange={(v) =>
              onChange((prev) => ({ ...prev, currency: v as CurrencyCode }))
            }
          />
        </div>
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <label htmlFor={dateId} className="text-sm font-semibold">
            Date
          </label>
          <Input
            id={dateId}
            type="date"
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
      </div>

      <div className="space-y-1.5">
        <label htmlFor={descriptionId} className="text-sm font-semibold">
          Description (optional)
        </label>
        <Input
          id={descriptionId}
          type="text"
          value={form.description}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              description: e.target.value,
            }))
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={categoryFieldId} className="text-sm font-semibold">
            Category
          </label>
          <CategorySelect
            id={categoryFieldId}
            value={form.categoryId}
            onChange={onCategoryChange}
            type={form.type}
            categories={categories}
          />
        </div>

        {form.type === "expense" && (
          <div className="space-y-1.5">
            <label htmlFor={budgetFieldId} className="text-sm font-semibold">
              Budget (optional)
            </label>
            <BudgetSelect
              id={budgetFieldId}
              value={form.budgetId}
              onChange={onBudgetChange}
            />
          </div>
        )}
      </div>
    </>
  );
}

function FormActions({
  onCancel,
  submitDisabled,
  submitLabel,
}: {
  onCancel: () => void;
  submitDisabled: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={submitDisabled}>
        {submitLabel}
      </Button>
    </div>
  );
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
  amountRef?: Ref<HTMLInputElement>;
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
  amountRef,
}: AddTransactionFormProps) {
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
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border p-4">
      <TransactionFields
        form={form}
        lastExpenseBudgetIdRef={lastExpenseBudgetIdRef}
        onChange={onChange}
        onCategoryChange={(categoryId) => {
          onAllowBudgetSuggestChange(true);
          onChange((prev) => ({ ...prev, categoryId }));
        }}
        onBudgetChange={(budgetId) => {
          onAllowBudgetSuggestChange(false);
          onChange((prev) => ({ ...prev, budgetId }));
        }}
        amountRef={amountRef}
      />

      {formError && (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Need this on a schedule?{" "}
        <SectionLink to="/financial/recurring">Set up a recurring transaction</SectionLink>
      </p>

      <FormActions
        onCancel={onCancel}
        submitDisabled={
          isSubmitting || !isPositiveDecimal(form.amount) || !form.categoryId
        }
        submitLabel={isSubmitting ? "Adding…" : "Add transaction"}
      />
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
  return (
    <form onSubmit={onSubmit} className="my-3 space-y-4 rounded-xl border border-border p-4">
      <TransactionFields
        form={form}
        lastExpenseBudgetIdRef={lastExpenseBudgetIdRef}
        onChange={onChange}
        onCategoryChange={(categoryId) => onChange((prev) => ({ ...prev, categoryId }))}
        onBudgetChange={(budgetId) => onChange((prev) => ({ ...prev, budgetId }))}
      />

      {recordId ? (
        <AuditHistoryPanel recordId={recordId} table="transactions" />
      ) : null}

      <FormActions
        onCancel={onCancel}
        submitDisabled={
          isSubmitting || !isPositiveDecimal(form.amount) || !form.categoryId
        }
        submitLabel={isSubmitting ? "Saving…" : "Save transaction"}
      />
    </form>
  );
}
