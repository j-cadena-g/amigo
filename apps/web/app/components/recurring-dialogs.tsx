import { useEffect, useId, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { CurrencySelect } from "@/app/components/currency-select";
import { BudgetSelect } from "@/app/components/budget-select";
import { CategorySelect } from "@/app/components/financial/category-select";
import { useFinancialCategories } from "@/app/components/financial/use-financial-categories";
import { DeleteButton, NativeSelect } from "@/app/components/financial/form-controls";
import { TypeToggle } from "@/app/components/type-toggle";
import { readApiErrorMessage } from "@/app/lib/api-error";
import { centsToInputString } from "@/app/lib/decimal-input";
import type { CurrencyCode } from "@amigo/db";
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";

const TRANSACTION_TYPE_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const;

type SchedulePreset =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly-1"
  | "monthly-15"
  | "monthly-last"
  | "monthly-same"
  | "yearly"
  | "custom";

const INTERVAL_UNITS: Record<RecurringFormData["customFrequency"], string> = {
  DAILY: "days",
  WEEKLY: "weeks",
  MONTHLY: "months",
};

interface RecurringFormData {
  type: "income" | "expense";
  amount: string;
  currency: string;
  categoryId: string;
  description: string;
  schedulePreset: SchedulePreset;
  customFrequency: "DAILY" | "WEEKLY" | "MONTHLY";
  customInterval: string;
  customDayOfMonth: string;
  startDate: string;
  endDate: string;
  budgetId: string | null;
}

interface RecurringRule {
  id: string;
  amount: number;
  currency: CurrencyCode;
  categoryId: string | null;
  category: string;
  description: string | null;
  type: "income" | "expense";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: string;
  endDate: string | null;
  budgetId: string | null;
}

function localDateString(date = new Date()): string {
  return date.toLocaleDateString("en-CA");
}

function emptyForm(currency: CurrencyCode): RecurringFormData {
  return {
    type: "expense",
    amount: "",
    currency,
    categoryId: "",
    description: "",
    schedulePreset: "monthly-1",
    customFrequency: "MONTHLY",
    customInterval: "1",
    customDayOfMonth: "1",
    startDate: localDateString(),
    endDate: "",
    budgetId: null,
  };
}

function canSubmit(form: RecurringFormData): boolean {
  return Boolean(form.amount && form.categoryId && form.startDate);
}

function presetToSchedule(preset: SchedulePreset, form: RecurringFormData) {
  switch (preset) {
    case "daily":
      return { frequency: "DAILY" as const, interval: 1, dayOfMonth: null, dayOfWeek: null };
    case "weekly":
      return { frequency: "WEEKLY" as const, interval: 1, dayOfMonth: null, dayOfWeek: new Date(form.startDate + "T00:00:00").getDay() };
    case "biweekly":
      return { frequency: "WEEKLY" as const, interval: 2, dayOfMonth: null, dayOfWeek: new Date(form.startDate + "T00:00:00").getDay() };
    case "monthly-1":
      return { frequency: "MONTHLY" as const, interval: 1, dayOfMonth: 1, dayOfWeek: null };
    case "monthly-15":
      return { frequency: "MONTHLY" as const, interval: 1, dayOfMonth: 15, dayOfWeek: null };
    case "monthly-last":
      return { frequency: "MONTHLY" as const, interval: 1, dayOfMonth: 31, dayOfWeek: null };
    case "monthly-same":
      return {
        frequency: "MONTHLY" as const,
        interval: 1,
        dayOfMonth: new Date(form.startDate + "T00:00:00").getDate(),
        dayOfWeek: null,
      };
    case "yearly":
      return { frequency: "YEARLY" as const, interval: 1, dayOfMonth: null, dayOfWeek: null };
    case "custom":
      return {
        frequency: form.customFrequency,
        interval: parseInt(form.customInterval, 10) || 1,
        dayOfMonth: form.customFrequency === "MONTHLY" ? (parseInt(form.customDayOfMonth, 10) || 1) : null,
        dayOfWeek: null,
      };
  }
}

function RecurringFields({
  form,
  setForm,
  initialBudgetSuggest = true,
  budgetSuggestScopeRef,
}: {
  form: RecurringFormData;
  setForm: React.Dispatch<React.SetStateAction<RecurringFormData>>;
  /** When false, category changes won't overwrite an existing budget until the user picks a category. */
  initialBudgetSuggest?: boolean;
  /** When set, budget suggestions are ignored after this ref's value changes (e.g. edit dialog rule switch). */
  budgetSuggestScopeRef?: React.RefObject<string | null | undefined>;
}) {
  const { categories } = useFinancialCategories();
  const [allowBudgetSuggest, setAllowBudgetSuggest] = useState(initialBudgetSuggest);
  const budgetSuggestRequestSeq = useRef(0);
  const amountId = useId();
  const currencyId = useId();
  const categoryFieldId = useId();
  const descriptionId = useId();
  const scheduleId = useId();
  const frequencyId = useId();
  const intervalId = useId();
  const intervalUnitId = useId();
  const dayOfMonthId = useId();
  const startDateId = useId();
  const endDateId = useId();
  const budgetFieldId = useId();

  const selectType = (type: "income" | "expense") =>
    setForm((f) => {
      if (type === f.type) return f;
      return {
        ...f,
        type,
        categoryId: "",
        budgetId: type === "expense" ? f.budgetId : null,
      };
    });

  useEffect(() => {
    setAllowBudgetSuggest(initialBudgetSuggest);
  }, [initialBudgetSuggest]);

  useEffect(() => {
    const requestSeq = ++budgetSuggestRequestSeq.current;
    if (form.type !== "expense" || !allowBudgetSuggest || !form.categoryId) return;
    const requestedCategoryId = form.categoryId;
    const scopeAtRequest = budgetSuggestScopeRef?.current;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/budgets/match-category?${new URLSearchParams({
              categoryId: requestedCategoryId,
            })}`,
            { signal: ac.signal }
          );
          if (!res.ok) return;
          const data = (await res.json()) as { budgetId: string | null };
          if (requestSeq !== budgetSuggestRequestSeq.current) return;
          if (
            budgetSuggestScopeRef &&
            scopeAtRequest !== budgetSuggestScopeRef.current
          ) {
            return;
          }
          setForm((f) =>
            f.type === "expense" && f.categoryId === requestedCategoryId
              ? { ...f, budgetId: data.budgetId ?? null }
              : f
          );
        } catch {
          /* aborted */
        }
      })();
    }, 200);
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [form.categoryId, form.type, allowBudgetSuggest, setForm, budgetSuggestScopeRef]);

  return (
    <>
      <TypeToggle
        label="Transaction type"
        options={TRANSACTION_TYPE_OPTIONS}
        value={form.type}
        onChange={selectType}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_5.75rem] gap-3">
        <div className="min-w-0 space-y-1.5">
          <label htmlFor={amountId} className="text-sm font-semibold">
            Amount
          </label>
          <Input
            id={amountId}
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="0.00"
            className="font-mono font-medium"
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
            onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={categoryFieldId} className="text-sm font-semibold">
          Category
        </label>
        <CategorySelect
          id={categoryFieldId}
          value={form.categoryId}
          onChange={(categoryId) => {
            setAllowBudgetSuggest(true);
            setForm((f) => ({ ...f, categoryId, budgetId: null }));
          }}
          type={form.type}
          categories={categories}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={descriptionId} className="text-sm font-semibold">
          Description (optional)
        </label>
        <Input
          id={descriptionId}
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={scheduleId} className="text-sm font-semibold">
          Schedule
        </label>
        <NativeSelect
          id={scheduleId}
          value={form.schedulePreset}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              schedulePreset: e.target.value as SchedulePreset,
            }))
          }
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="monthly-1">Monthly on the 1st</option>
          <option value="monthly-15">Monthly on the 15th</option>
          <option value="monthly-last">Monthly on the last day</option>
          <option value="monthly-same">Monthly, same day as the start date</option>
          <option value="yearly">Yearly</option>
          <option value="custom">Custom</option>
        </NativeSelect>
      </div>

      {form.schedulePreset === "custom" && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="space-y-1.5">
            <label htmlFor={frequencyId} className="text-sm font-semibold">
              Frequency
            </label>
            <NativeSelect
              id={frequencyId}
              value={form.customFrequency}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  customFrequency: e.target.value as "DAILY" | "WEEKLY" | "MONTHLY",
                }))
              }
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={intervalId} className="text-sm font-semibold">
              Repeat every
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={intervalId}
                type="number"
                min="1"
                value={form.customInterval}
                onChange={(e) =>
                  setForm((f) => ({ ...f, customInterval: e.target.value }))
                }
                aria-describedby={intervalUnitId}
                className="w-24"
              />
              <span id={intervalUnitId} className="text-sm text-muted-foreground">
                {INTERVAL_UNITS[form.customFrequency]}
              </span>
            </div>
          </div>
          {form.customFrequency === "MONTHLY" && (
            <div className="space-y-1.5">
              <label htmlFor={dayOfMonthId} className="text-sm font-semibold">
                Day of month
              </label>
              <Input
                id={dayOfMonthId}
                type="number"
                min="1"
                max="31"
                value={form.customDayOfMonth}
                onChange={(e) =>
                  setForm((f) => ({ ...f, customDayOfMonth: e.target.value }))
                }
              />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={startDateId} className="text-sm font-semibold">
            Start date
          </label>
          <Input
            id={startDateId}
            type="date"
            value={form.startDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, startDate: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={endDateId} className="text-sm font-semibold">
            End date (optional)
          </label>
          <Input
            id={endDateId}
            type="date"
            value={form.endDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, endDate: e.target.value }))
            }
          />
        </div>
      </div>

      {form.type === "expense" && (
        <div className="space-y-1.5">
          <label htmlFor={budgetFieldId} className="text-sm font-semibold">
            Budget (optional)
          </label>
          <BudgetSelect
            id={budgetFieldId}
            value={form.budgetId}
            onChange={(v) => {
              setAllowBudgetSuggest(false);
              budgetSuggestRequestSeq.current += 1;
              setForm((f) => ({ ...f, budgetId: v }));
            }}
          />
        </div>
      )}
    </>
  );
}

function requestBody(form: RecurringFormData) {
  const schedule = presetToSchedule(form.schedulePreset, form);
  return {
    type: form.type,
    // API expects dollars; server applies toCents() (same contract as transactions).
    amount: parseFloat(form.amount),
    currency: form.currency,
    categoryId: form.categoryId,
    description: form.description || null,
    frequency: schedule.frequency,
    interval: schedule.interval,
    dayOfMonth: schedule.dayOfMonth,
    dayOfWeek: schedule.dayOfWeek,
    startDate: form.startDate,
    endDate: form.endDate || null,
    budgetId: form.type === "expense" ? form.budgetId : null,
  };
}

// ── Add Dialog ──────────────────────────────────────────────────────────────

interface AddRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCurrency?: CurrencyCode;
}

export function AddRecurringDialog({
  open,
  onOpenChange,
  defaultCurrency = "CAD",
}: AddRecurringDialogProps) {
  const revalidator = useRevalidator();
  const [form, setForm] = useState<RecurringFormData>(() => emptyForm(defaultCurrency));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm(emptyForm(defaultCurrency));
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(form)),
      });
      if (!res.ok) {
        setError(
          (await readApiErrorMessage(res)) ??
            "Couldn't add the recurring transaction. Try again."
        );
        return;
      }
      setForm(emptyForm(defaultCurrency));
      onOpenChange(false);
      revalidator.revalidate();
    } catch {
      setError(
        "Couldn't add the recurring transaction. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog key={defaultCurrency} open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add recurring transaction</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4"
        >
          <RecurringFields form={form} setForm={setForm} />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !canSubmit(form)}>
              {submitting ? "Adding…" : "Add recurring"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Dialog ─────────────────────────────────────────────────────────────

interface EditRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RecurringRule | null;
  onDelete: () => void;
  deleting: boolean;
}

function ruleToPreset(rule: RecurringRule): SchedulePreset {
  if (rule.frequency === "DAILY" && rule.interval === 1) return "daily";
  if (rule.frequency === "WEEKLY" && rule.interval === 1) return "weekly";
  if (rule.frequency === "WEEKLY" && rule.interval === 2) return "biweekly";
  if (rule.frequency === "MONTHLY" && rule.interval === 1) {
    if (rule.dayOfMonth === 1) return "monthly-1";
    if (rule.dayOfMonth === 15) return "monthly-15";
    if (rule.dayOfMonth === 31) return "monthly-last";
    return "monthly-same";
  }
  if (rule.frequency === "YEARLY" && rule.interval === 1) return "yearly";
  return "custom";
}

function ruleToForm(rule: RecurringRule): RecurringFormData {
  const preset = ruleToPreset(rule);
  return {
    type: rule.type,
    amount: centsToInputString(rule.amount),
    currency: rule.currency,
    categoryId: rule.categoryId ?? "",
    description: rule.description ?? "",
    schedulePreset: preset,
    customFrequency: rule.frequency === "YEARLY" ? "MONTHLY" : (rule.frequency as "DAILY" | "WEEKLY" | "MONTHLY"),
    customInterval: String(rule.interval),
    customDayOfMonth: String(rule.dayOfMonth ?? 1),
    startDate: rule.startDate,
    endDate: rule.endDate ?? "",
    budgetId: rule.budgetId,
  };
}

export function EditRecurringDialog({
  open,
  onOpenChange,
  rule,
  onDelete,
  deleting,
}: EditRecurringDialogProps) {
  const revalidator = useRevalidator();
  const [form, setForm] = useState<RecurringFormData>(() =>
    emptyForm(rule?.currency ?? "CAD")
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState<string | null>(null);
  const budgetSuggestScopeRef = useRef<string | null>(rule?.id ?? null);
  budgetSuggestScopeRef.current = rule?.id ?? null;

  // Sync form state when the rule changes
  if (rule && initialized !== rule.id) {
    setForm(ruleToForm(rule));
    setError(null);
    setInitialized(rule.id);
  }
  if (!rule && initialized !== null) {
    setInitialized(null);
  }

  const busy = submitting || deleting;

  async function handleSubmit() {
    if (!rule) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/recurring/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(form)),
      });
      if (!res.ok) {
        setError(
          (await readApiErrorMessage(res)) ??
            "Couldn't save the recurring transaction. Try again."
        );
        return;
      }
      onOpenChange(false);
      revalidator.revalidate();
    } catch {
      setError(
        "Couldn't save the recurring transaction. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Edit recurring transaction</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4"
        >
          <RecurringFields
            key={rule?.id ?? "none"}
            form={form}
            setForm={setForm}
            initialBudgetSuggest={false}
            budgetSuggestScopeRef={budgetSuggestScopeRef}
          />
          {rule ? (
            <AuditHistoryPanel
              recordId={rule.id}
              table="recurring_transactions"
            />
          ) : null}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <DeleteButton onClick={onDelete} disabled={busy} className="sm:mr-auto">
              <Trash2 />
              {deleting ? "Deleting…" : "Delete"}
            </DeleteButton>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !canSubmit(form)}>
              {submitting ? "Saving…" : "Save recurring"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
