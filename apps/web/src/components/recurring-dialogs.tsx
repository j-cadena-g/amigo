"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@amigo/ui";
import { createRecurringRule, updateRecurringRule } from "@/actions/recurring";
import type { RecurringTransaction } from "@amigo/db/schema";

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

function getFrequencyPluralLabel(frequency: Frequency): string {
  const labels: Record<Frequency, string> = {
    DAILY: "days",
    WEEKLY: "weeks",
    MONTHLY: "months",
    YEARLY: "years",
  };
  return labels[frequency];
}

interface RecurringFormData {
  amount: string;
  category: string;
  description: string;
  type: "income" | "expense";
  frequency: Frequency;
  interval: string;
  startDate: string;
  endDate: string;
}

function RecurringForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initialData: RecurringFormData;
  onSubmit: (data: RecurringFormData) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [formData, setFormData] = useState<RecurringFormData>(initialData);
  const [isPending, startTransition] = useTransition();

  const interval = parseInt(formData.interval) || 1;
  const schedulePreview =
    interval === 1
      ? `Repeats every ${getFrequencyPluralLabel(formData.frequency).slice(0, -1)}`
      : `Repeats every ${interval} ${getFrequencyPluralLabel(formData.frequency)}`;

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
          onClick={() => setFormData((prev) => ({ ...prev, type: "income" }))}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            formData.type === "income"
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          Income
        </button>
      </div>

      {/* Amount */}
      <div>
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

      {/* Frequency & Interval */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-muted-foreground">
            Frequency
          </label>
          <select
            value={formData.frequency}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                frequency: e.target.value as Frequency,
              }))
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">
            Every X
          </label>
          <Input
            type="number"
            min="1"
            value={formData.interval}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, interval: e.target.value }))
            }
            required
          />
        </div>
      </div>

      {/* Schedule Preview */}
      <p className="text-sm text-muted-foreground italic">{schedulePreview}</p>

      {/* Start Date */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">
          Start Date
        </label>
        <Input
          type="date"
          value={formData.startDate}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, startDate: e.target.value }))
          }
          required
        />
      </div>

      {/* End Date (optional) */}
      <div>
        <label className="text-sm font-medium text-muted-foreground">
          End Date (optional)
        </label>
        <Input
          type="date"
          value={formData.endDate}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, endDate: e.target.value }))
          }
        />
      </div>

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
    await createRecurringRule({
      amount: parseFloat(data.amount),
      category: data.category.trim(),
      description: data.description.trim() || undefined,
      type: data.type,
      frequency: data.frequency,
      interval: parseInt(data.interval) || 1,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    });
    onSuccess();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Add Recurring Rule</h2>
            <p className="text-sm text-muted-foreground">
              Create a recurring transaction that repeats on a schedule.
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
            frequency: "MONTHLY",
            interval: "1",
            startDate: today,
            endDate: "",
          }}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel="Create Rule"
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
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().split("T")[0] ?? "";
  };

  const handleSubmit = async (data: RecurringFormData) => {
    await updateRecurringRule({
      id: rule.id,
      amount: parseFloat(data.amount),
      category: data.category.trim(),
      description: data.description.trim() || null,
      type: data.type,
      frequency: data.frequency,
      interval: parseInt(data.interval) || 1,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
    });
    onSuccess();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-xl">
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
            frequency: rule.frequency,
            interval: String(rule.interval),
            startDate: formatDateForInput(rule.startDate),
            endDate: rule.endDate ? formatDateForInput(rule.endDate) : "",
          }}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel="Save Changes"
        />
      </div>
    </div>
  );
}
