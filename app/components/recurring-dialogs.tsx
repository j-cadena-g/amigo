import { useState } from "react";
import { useRevalidator } from "react-router";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { CurrencySelect } from "@/app/components/currency-select";
import { BudgetSelect } from "@/app/components/budget-select";
import { CategorySelect } from "@/app/components/financial/category-select";
import { useFinancialCategories } from "@/app/components/financial/use-financial-categories";
import type { CurrencyCode } from "@amigo/db";

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

function RecurringForm({
  form,
  setForm,
  onSubmit,
  submitting,
  submitLabel,
}: {
  form: RecurringFormData;
  setForm: React.Dispatch<React.SetStateAction<RecurringFormData>>;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  const { categories } = useFinancialCategories();
  const canSubmit = form.amount && form.categoryId && form.startDate && !submitting;

  return (
    <div className="space-y-4">
      {/* Type toggle */}
      <div className="flex rounded-md border">
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, type: "expense", categoryId: "", budgetId: f.budgetId }))}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-l-md transition-colors ${
            form.type === "expense"
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              : "hover:bg-muted"
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, type: "income", categoryId: "", budgetId: null }))}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-r-md transition-colors ${
            form.type === "income"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "hover:bg-muted"
          }`}
        >
          Income
        </button>
      </div>

      {/* Amount + Currency */}
      <div className="grid grid-cols-[minmax(0,1fr)_5.75rem] gap-2">
        <div className="min-w-0">
          <label className="text-sm font-medium">Amount</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Currency</label>
          <CurrencySelect
            compact
            value={form.currency}
            onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
          />
        </div>
      </div>

      {/* Category + Description */}
      <div>
        <label className="text-sm font-medium">Category</label>
        <CategorySelect
          value={form.categoryId}
          onChange={(categoryId) => setForm((f) => ({ ...f, categoryId }))}
          type={form.type}
          categories={categories}
        />
      </div>
      <div>
        <label className="text-sm font-medium">Description</label>
        <Input
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          placeholder="Optional description"
        />
      </div>

      {/* Schedule preset */}
      <div>
        <label htmlFor="recurring-schedule" className="text-sm font-medium">
          Schedule
        </label>
        <select
          id="recurring-schedule"
          value={form.schedulePreset}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              schedulePreset: e.target.value as SchedulePreset,
            }))
          }
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly-1">Monthly (1st)</option>
          <option value="monthly-15">Monthly (15th)</option>
          <option value="monthly-last">Monthly (last day)</option>
          <option value="monthly-same">Monthly (same day as start)</option>
          <option value="yearly">Yearly</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {/* Custom schedule fields */}
      {form.schedulePreset === "custom" && (
        <div className="space-y-3 rounded-md border p-3">
          <div>
            <label
              htmlFor="recurring-custom-frequency"
              className="text-sm font-medium"
            >
              Frequency
            </label>
            <select
              id="recurring-custom-frequency"
              value={form.customFrequency}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  customFrequency: e.target.value as "DAILY" | "WEEKLY" | "MONTHLY",
                }))
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Every N intervals</label>
            <Input
              type="number"
              min="1"
              value={form.customInterval}
              onChange={(e) =>
                setForm((f) => ({ ...f, customInterval: e.target.value }))
              }
            />
          </div>
          {form.customFrequency === "MONTHLY" && (
            <div>
              <label className="text-sm font-medium">Day of month</label>
              <Input
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

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Start date</label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, startDate: e.target.value }))
            }
          />
        </div>
        <div>
          <label className="text-sm font-medium">End date (optional)</label>
          <Input
            type="date"
            value={form.endDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, endDate: e.target.value }))
            }
          />
        </div>
      </div>

      {/* Budget (expenses only) */}
      {form.type === "expense" && (
        <div>
          <label className="text-sm font-medium">Budget</label>
          <BudgetSelect
            value={form.budgetId}
            onChange={(v) => setForm((f) => ({ ...f, budgetId: v }))}
          />
        </div>
      )}

      <Button onClick={onSubmit} disabled={!canSubmit} className="w-full">
        {submitting ? "Saving..." : submitLabel}
      </Button>
    </div>
  );
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

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const schedule = presetToSchedule(form.schedulePreset, form);
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to add recurring transaction");
      }
      setForm(emptyForm(defaultCurrency));
      onOpenChange(false);
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      key={defaultCurrency}
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setForm(emptyForm(defaultCurrency));
          setError(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Recurring Transaction</DialogTitle>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <RecurringForm
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Add"
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Dialog ─────────────────────────────────────────────────────────────

interface EditRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RecurringRule | null;
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
    amount: (rule.amount / 100).toFixed(2),
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
}: EditRecurringDialogProps) {
  const revalidator = useRevalidator();
  const [form, setForm] = useState<RecurringFormData>(() =>
    emptyForm(rule?.currency ?? "CAD")
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState<string | null>(null);

  // Sync form state when the rule changes
  if (rule && initialized !== rule.id) {
    setForm(ruleToForm(rule));
    setInitialized(rule.id);
  }
  if (!rule && initialized !== null) {
    setInitialized(null);
  }

  async function handleSubmit() {
    if (!rule) return;
    setSubmitting(true);
    setError(null);
    try {
      const schedule = presetToSchedule(form.schedulePreset, form);
      const res = await fetch(`/api/recurring/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to update recurring transaction");
      }
      onOpenChange(false);
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Recurring Transaction</DialogTitle>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <RecurringForm
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Save Changes"
        />
      </DialogContent>
    </Dialog>
  );
}
