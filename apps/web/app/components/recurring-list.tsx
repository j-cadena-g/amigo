import { useState } from "react";
import { useRevalidator } from "react-router";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toastMutationFailure } from "@/app/lib/api-error";
import { formatCents } from "@/app/lib/currency";
import { formatTransactionDate } from "@/app/lib/format-dates";
import { getFrequencyLabel } from "@/app/lib/recurring-labels";
import { cn } from "@/app/lib/utils";
import { EmptyState } from "@/app/components/empty-state";
import { useToast } from "@/app/components/toast-provider";
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
import {
  AddRecurringDialog,
  EditRecurringDialog,
} from "@/app/components/recurring-dialogs";
import type { CurrencyCode } from "@amigo/db";

interface RecurringRule {
  id: string;
  householdId: string;
  userId: string | null;
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
  nextRunDate: string;
  isActive: boolean;
  budgetId: string | null;
  createdAt: number;
}

interface RecurringListProps {
  rules: RecurringRule[];
  homeCurrency: CurrencyCode;
}

function RecurringRuleCard({
  rule,
  toggling,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: RecurringRule;
  toggling: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isIncome = rule.type === "income";
  const title = rule.description || rule.category;
  const amountLabel = `${isIncome ? "+" : "-"}${formatCents(rule.amount, rule.currency)}`;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4",
        !rule.isActive && "border-dashed opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        <Switch
          className="mt-0.5"
          checked={rule.isActive}
          disabled={toggling}
          onCheckedChange={onToggle}
          aria-label={rule.isActive ? `Pause ${title}` : `Resume ${title}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-medium break-words">{title}</p>
            <span
              className={cn(
                "shrink-0 font-medium tabular-nums whitespace-nowrap",
                isIncome
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {amountLabel}
            </span>
          </div>

          <span className="mt-1 inline-block text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted capitalize">
            {rule.category}
          </span>

          <p className="mt-1.5 text-sm text-muted-foreground">
            {getFrequencyLabel(rule)}
          </p>
          <p className="text-sm text-muted-foreground">
            Next: {formatTransactionDate(rule.nextRunDate)}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-1 pl-14">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={onEdit}
          aria-label={`Edit ${title}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={onDelete}
          aria-label={`Delete ${title}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function RecurringList({ rules, homeCurrency }: RecurringListProps) {
  const revalidator = useRevalidator();
  const toast = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
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
        return;
      }
      await toastMutationFailure(toast, res, "Update recurring rule");
    } catch {
      await toastMutationFailure(toast, null, "Update recurring rule");
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
        return;
      }
      await toastMutationFailure(toast, res, "Delete recurring rule");
    } catch {
      await toastMutationFailure(toast, null, "Delete recurring rule");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setShowAddDialog(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-muted-foreground hover:border-muted-foreground hover:text-foreground"
      >
        <Plus className="h-5 w-5" />
        Add Recurring Transaction
      </button>

      {rules.length === 0 ? (
        <EmptyState
          title="No recurring transactions yet"
          description="Add a scheduled transaction to automate regular income or expenses."
        />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RecurringRuleCard
              key={rule.id}
              rule={rule}
              toggling={toggling === rule.id}
              onToggle={() => handleToggle(rule)}
              onEdit={() => setEditingRule(rule)}
              onDelete={() => setDeletingRule(rule)}
            />
          ))}
        </div>
      )}

      <AddRecurringDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        defaultCurrency={homeCurrency}
      />

      <EditRecurringDialog
        open={editingRule !== null}
        onOpenChange={(open) => {
          if (!open) setEditingRule(null);
        }}
        rule={editingRule}
      />

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
