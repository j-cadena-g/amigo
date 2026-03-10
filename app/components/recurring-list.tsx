import { useState } from "react";
import { useRevalidator } from "react-router";
import { formatCents } from "@/app/lib/currency";
import { Switch } from "@/app/components/ui/switch";
import { Button } from "@/app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import type { CurrencyCode } from "@amigo/db";

interface RecurringRule {
  id: string;
  householdId: string;
  userId: string | null;
  amount: number;
  currency: CurrencyCode;
  category: string;
  description: string | null;
  type: "income" | "expense";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  isActive: boolean;
  budgetId: string | null;
  createdAt: number;
}

interface RecurringListProps {
  rules: RecurringRule[];
  session: { userId: string };
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function getFrequencyLabel(rule: RecurringRule): string {
  const { frequency, interval, dayOfMonth, dayOfWeek } = rule;

  if (frequency === "DAILY") {
    return interval === 1 ? "Daily" : `Every ${interval} days`;
  }

  if (frequency === "WEEKLY") {
    const dayName =
      dayOfWeek !== null && dayOfWeek !== undefined
        ? DAY_NAMES[dayOfWeek]
        : null;
    if (interval === 1) {
      return dayName ? `Every ${dayName}` : "Weekly";
    }
    return dayName
      ? `Every ${interval} weeks on ${dayName}`
      : `Every ${interval} weeks`;
  }

  if (frequency === "MONTHLY") {
    const dayLabel =
      dayOfMonth !== null && dayOfMonth !== undefined
        ? ordinal(dayOfMonth)
        : null;
    if (interval === 1) {
      return dayLabel ? `${dayLabel} of every month` : "Monthly";
    }
    return dayLabel
      ? `${dayLabel} of every ${interval} months`
      : `Every ${interval} months`;
  }

  if (frequency === "YEARLY") {
    return interval === 1 ? "Yearly" : `Every ${interval} years`;
  }

  return "Custom";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th");
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RecurringList({ rules, session: _session }: RecurringListProps) {
  const revalidator = useRevalidator();
  const [toggling, setToggling] = useState<string | null>(null);
  const [deletingRule, setDeletingRule] = useState<RecurringRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleToggle(rule: RecurringRule) {
    setToggling(rule.id);
    try {
      const res = await fetch(`/api/recurring/${rule.id}/toggle`, {
        method: "POST",
      });
      if (res.ok) {
        revalidator.revalidate();
      }
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete() {
    if (!deletingRule) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/recurring/${deletingRule.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeletingRule(null);
        revalidator.revalidate();
      }
    } finally {
      setDeleting(false);
    }
  }

  if (rules.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        No recurring transactions yet. Add one to automate regular income or
        expenses.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rules.map((rule) => {
        const isIncome = rule.type === "income";

        return (
          <div
            key={rule.id}
            className="flex items-center gap-4 rounded-lg border p-4"
          >
            <Switch
              checked={rule.isActive}
              disabled={toggling === rule.id}
              onCheckedChange={() => handleToggle(rule)}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">
                  {rule.description || rule.category}
                </span>
                <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted capitalize">
                  {rule.category}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                <span>{getFrequencyLabel(rule)}</span>
                <span>&middot;</span>
                <span>Next: {formatDate(rule.nextRunDate)}</span>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span
                className={`font-medium ${isIncome ? "text-green-600" : "text-red-600"}`}
              >
                {isIncome ? "+" : "-"}
                {formatCents(rule.amount, rule.currency)}
              </span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeletingRule(rule)}
            >
              Delete
            </Button>
          </div>
        );
      })}

      <AlertDialog
        open={deletingRule !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingRule(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recurring Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this recurring{" "}
              {deletingRule?.type}? Future transactions will no longer be
              generated. Past transactions are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
