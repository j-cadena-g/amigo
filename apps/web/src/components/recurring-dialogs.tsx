"use client";

import { useState, useTransition, useMemo } from "react";
import { Button, Input } from "@amigo/ui";
import { createRecurringRule, updateRecurringRule } from "@/actions/recurring";
import { BudgetSelect } from "@/components/budget-select";
import { CurrencySelect } from "@/components/currency-select";
import type { RecurringTransaction, CurrencyCode } from "@amigo/db/schema";

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

// Schedule preset that maps to underlying frequency/interval/dayOfMonth
interface SchedulePreset {
  id: string;
  label: string;
  frequency: Frequency;
  interval: number;
  dayOfMonth?: number; // Only for monthly presets with fixed day
  dynamic?: boolean; // If true, day comes from start date
}

const SCHEDULE_PRESETS: SchedulePreset[] = [
  { id: "daily", label: "Every day", frequency: "DAILY", interval: 1 },
  { id: "weekly", label: "Every week", frequency: "WEEKLY", interval: 1, dynamic: true },
  { id: "biweekly", label: "Every 2 weeks", frequency: "WEEKLY", interval: 2, dynamic: true },
  { id: "monthly-1", label: "Monthly on the 1st", frequency: "MONTHLY", interval: 1, dayOfMonth: 1 },
  { id: "monthly-15", label: "Monthly on the 15th", frequency: "MONTHLY", interval: 1, dayOfMonth: 15 },
  { id: "monthly-last", label: "Monthly on the last day", frequency: "MONTHLY", interval: 1, dayOfMonth: 31 },
  { id: "monthly-same", label: "Monthly (same day as start)", frequency: "MONTHLY", interval: 1, dynamic: true },
  { id: "yearly", label: "Every year", frequency: "YEARLY", interval: 1, dynamic: true },
  { id: "custom", label: "Custom schedule...", frequency: "MONTHLY", interval: 1 },
];

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

// Calculate next N occurrences for preview, respecting end date
function calculateNextOccurrences(
  startDate: Date,
  frequency: Frequency,
  interval: number,
  dayOfMonth: number | undefined,
  count: number,
  endDate?: Date
): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = endDate ? new Date(endDate) : null;
  if (end) end.setHours(23, 59, 59, 999);

  for (let i = 0; i < count; i++) {
    // Stop if we've passed the end date
    if (end && current > end) break;

    dates.push(new Date(current));

    // Calculate next occurrence
    switch (frequency) {
      case "DAILY":
        current.setDate(current.getDate() + interval);
        break;
      case "WEEKLY":
        current.setDate(current.getDate() + interval * 7);
        break;
      case "MONTHLY":
        current.setMonth(current.getMonth() + interval);
        if (dayOfMonth) {
          const year = current.getFullYear();
          const month = current.getMonth();
          const lastDay = new Date(year, month + 1, 0).getDate();
          current.setDate(Math.min(dayOfMonth, lastDay));
        }
        break;
      case "YEARLY":
        current.setFullYear(current.getFullYear() + interval);
        break;
    }
  }

  return dates;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface RecurringFormData {
  amount: string;
  category: string;
  description: string;
  type: "income" | "expense";
  schedulePreset: string;
  // Custom schedule fields (only used when preset is "custom")
  customFrequency: Frequency;
  customInterval: string;
  customDayOfMonth: string;
  startDate: string;
  endDate: string;
  budgetId: string | null;
  currency: CurrencyCode;
}

// Convert form data to the underlying schedule values
function getScheduleValues(formData: RecurringFormData): {
  frequency: Frequency;
  interval: number;
  dayOfMonth: number | undefined;
} {
  if (formData.schedulePreset === "custom") {
    return {
      frequency: formData.customFrequency,
      interval: parseInt(formData.customInterval) || 1,
      dayOfMonth: formData.customDayOfMonth ? parseInt(formData.customDayOfMonth) : undefined,
    };
  }

  const preset = SCHEDULE_PRESETS.find((p) => p.id === formData.schedulePreset);
  if (!preset) {
    return { frequency: "MONTHLY", interval: 1, dayOfMonth: undefined };
  }

  // For dynamic presets, dayOfMonth comes from start date (or undefined for non-monthly)
  let dayOfMonth = preset.dayOfMonth;
  if (preset.dynamic && preset.frequency === "MONTHLY" && formData.startDate) {
    const startDay = new Date(formData.startDate + "T00:00:00").getDate();
    dayOfMonth = startDay;
  }

  return {
    frequency: preset.frequency,
    interval: preset.interval,
    dayOfMonth: preset.frequency === "MONTHLY" ? dayOfMonth : undefined,
  };
}

// Find the best matching preset for existing rule data
function findMatchingPreset(
  frequency: Frequency,
  interval: number,
  dayOfMonth: number | null | undefined,
  startDate: string
): string {
  const startDay = startDate ? new Date(startDate + "T00:00:00").getDate() : 1;

  // Check each preset for a match
  for (const preset of SCHEDULE_PRESETS) {
    if (preset.id === "custom") continue;

    if (preset.frequency !== frequency) continue;
    if (preset.interval !== interval) continue;

    // For monthly presets, check dayOfMonth
    if (frequency === "MONTHLY") {
      if (preset.dynamic) {
        // "monthly-same" matches if dayOfMonth equals start date day (or is null)
        if (!dayOfMonth || dayOfMonth === startDay) {
          return preset.id;
        }
      } else if (preset.dayOfMonth === dayOfMonth) {
        return preset.id;
      }
    } else {
      // Non-monthly - just need frequency/interval match
      return preset.id;
    }
  }

  return "custom";
}

function RecurringForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel,
  minStartDate,
}: {
  initialData: RecurringFormData;
  onSubmit: (data: RecurringFormData) => void;
  onCancel: () => void;
  submitLabel: string;
  minStartDate?: string;
}) {
  const [formData, setFormData] = useState<RecurringFormData>(initialData);
  const [isPending, startTransition] = useTransition();

  const isCustom = formData.schedulePreset === "custom";
  const scheduleValues = getScheduleValues(formData);

  // Calculate preview dates
  const previewDates = useMemo(() => {
    if (!formData.startDate) return [];
    const start = new Date(formData.startDate + "T00:00:00");
    if (isNaN(start.getTime())) return [];

    const end = formData.endDate ? new Date(formData.endDate + "T00:00:00") : undefined;

    return calculateNextOccurrences(
      start,
      scheduleValues.frequency,
      scheduleValues.interval,
      scheduleValues.dayOfMonth,
      4,
      end
    );
  }, [formData.startDate, formData.endDate, scheduleValues.frequency, scheduleValues.interval, scheduleValues.dayOfMonth]);

  // Check if schedule ends before showing all 4 dates
  const hasEndDate = !!formData.endDate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      onSubmit(formData);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type Toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFormData((prev) => ({ ...prev, type: "expense" }))}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            formData.type === "expense"
              ? "bg-red-500/10 text-red-600 dark:text-red-400"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => setFormData((prev) => ({ ...prev, type: "income", budgetId: null }))}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            formData.type === "income"
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          Income
        </button>
      </div>

      {/* Amount and Currency */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="text-sm font-medium text-muted-foreground">
            Amount
          </label>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={formData.amount}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, amount: e.target.value }))
            }
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">
            Currency
          </label>
          <CurrencySelect
            value={formData.currency}
            onChange={(currency) =>
              setFormData((prev) => ({ ...prev, currency }))
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">
          Category
        </label>
        <Input
          type="text"
          placeholder="e.g., Rent, Salary, Subscription"
          value={formData.category}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, category: e.target.value }))
          }
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">
          Description (optional)
        </label>
        <Input
          type="text"
          placeholder="e.g., Netflix subscription"
          value={formData.description}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, description: e.target.value }))
          }
        />
      </div>

      {/* Start Date - moved before schedule so presets can reference it */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">
          First occurrence
        </label>
        <Input
          type="date"
          value={formData.startDate}
          min={minStartDate}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, startDate: e.target.value }))
          }
          required
        />
      </div>

      {/* Schedule Preset Dropdown */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">
          Repeats
        </label>
        <select
          value={formData.schedulePreset}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, schedulePreset: e.target.value }))
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {SCHEDULE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>

      {/* Custom Schedule Fields (only shown when "Custom" is selected) */}
      {isCustom && (
        <div className="space-y-3 rounded-md border border-dashed p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Frequency
              </label>
              <select
                value={formData.customFrequency}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    customFrequency: e.target.value as Frequency,
                    customDayOfMonth: e.target.value !== "MONTHLY" ? "" : prev.customDayOfMonth,
                  }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Every
              </label>
              <Input
                type="number"
                min="1"
                value={formData.customInterval}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, customInterval: e.target.value }))
                }
                required
              />
            </div>
          </div>
          {formData.customFrequency === "MONTHLY" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Day of month
              </label>
              <select
                value={formData.customDayOfMonth}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, customDayOfMonth: e.target.value }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Same as start date</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={String(day)}>
                    {day}{getOrdinalSuffix(day)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Schedule Preview */}
      {previewDates.length > 0 && (
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Schedule preview</p>
          <p className="text-sm">
            {previewDates.map((date, i) => (
              <span key={i}>
                {i > 0 && <span className="text-muted-foreground"> → </span>}
                <span className={i === 0 ? "font-medium" : ""}>{formatShortDate(date)}</span>
              </span>
            ))}
            {hasEndDate && previewDates.length < 4 ? (
              <span className="text-muted-foreground"> (ends)</span>
            ) : (
              <span className="text-muted-foreground"> → ...</span>
            )}
          </p>
        </div>
      )}

      {/* End Date (optional) */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">
          End date (optional)
        </label>
        <Input
          type="date"
          value={formData.endDate}
          min={formData.startDate}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, endDate: e.target.value }))
          }
        />
      </div>

      {/* Budget Selection (optional, expenses only) */}
      {formData.type === "expense" && (
        <div>
          <label className="text-sm font-medium text-muted-foreground">
            Budget (optional)
          </label>
          <BudgetSelect
            value={formData.budgetId}
            onChange={(budgetId) =>
              setFormData((prev) => ({ ...prev, budgetId }))
            }
          />
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !formData.amount} className="flex-1">
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

interface AddRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddRecurringDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddRecurringDialogProps) {
  const today = new Date().toISOString().split("T")[0] ?? "";

  const handleSubmit = async (data: RecurringFormData) => {
    try {
      const schedule = getScheduleValues(data);
      await createRecurringRule({
        amount: parseFloat(data.amount),
        category: data.category.trim(),
        description: data.description.trim() || undefined,
        type: data.type,
        frequency: schedule.frequency,
        interval: schedule.interval,
        dayOfMonth: schedule.dayOfMonth,
        startDate: new Date(data.startDate + "T00:00:00"),
        endDate: data.endDate ? new Date(data.endDate + "T00:00:00") : undefined,
        budgetId: data.budgetId,
        currency: data.currency,
      });
      onSuccess();
    } catch (error) {
      console.error("Failed to create recurring rule:", error);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Add Recurring Rule</h2>
            <p className="text-sm text-muted-foreground">
              Create a transaction that repeats automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>
        <RecurringForm
          key={open ? "open" : "closed"}
          initialData={{
            amount: "",
            category: "",
            description: "",
            type: "expense",
            schedulePreset: "monthly-1",
            customFrequency: "MONTHLY",
            customInterval: "1",
            customDayOfMonth: "",
            startDate: today,
            endDate: "",
            budgetId: null,
            currency: "CAD",
          }}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel="Create Rule"
          minStartDate={today}
        />
      </div>
    </div>
  );
}

interface EditRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RecurringTransaction;
  onSuccess: () => void;
}

export function EditRecurringDialog({
  open,
  onOpenChange,
  rule,
  onSuccess,
}: EditRecurringDialogProps) {
  const formatDateForInput = (date: Date | string): string => {
    if (typeof date === "string") {
      // Handle ISO strings by extracting date portion
      return date.split("T")[0] ?? "";
    }
    // For Date objects, use UTC to avoid timezone shift
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const startDateStr = formatDateForInput(rule.startDate);
  const matchingPreset = findMatchingPreset(
    rule.frequency,
    rule.interval,
    rule.dayOfMonth,
    startDateStr
  );

  const handleSubmit = async (data: RecurringFormData) => {
    try {
      const schedule = getScheduleValues(data);
      await updateRecurringRule({
        id: rule.id,
        amount: parseFloat(data.amount),
        category: data.category.trim(),
        description: data.description.trim() || null,
        type: data.type,
        frequency: schedule.frequency,
        interval: schedule.interval,
        dayOfMonth: schedule.dayOfMonth ?? null,
        startDate: new Date(data.startDate + "T00:00:00"),
        endDate: data.endDate ? new Date(data.endDate + "T00:00:00") : null,
        budgetId: data.budgetId,
        currency: data.currency,
      });
      onSuccess();
    } catch (error) {
      console.error("Failed to update recurring rule:", error);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Edit Recurring Rule</h2>
            <p className="text-sm text-muted-foreground">
              Modify the recurring transaction settings.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>
        <RecurringForm
          initialData={{
            amount: rule.amount,
            category: rule.category,
            description: rule.description || "",
            type: rule.type,
            schedulePreset: matchingPreset,
            customFrequency: rule.frequency,
            customInterval: String(rule.interval),
            customDayOfMonth: rule.dayOfMonth ? String(rule.dayOfMonth) : "",
            startDate: startDateStr,
            endDate: rule.endDate ? formatDateForInput(rule.endDate) : "",
            budgetId: rule.budgetId ?? null,
            currency: rule.currency as CurrencyCode,
          }}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel="Save Changes"
        />
      </div>
    </div>
  );
}
