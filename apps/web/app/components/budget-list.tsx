import { useState } from "react";
import { useRevalidator } from "react-router";
import { toastMutationFailure } from "@/app/lib/api-error";
import { formatCents } from "@/app/lib/currency";
import { cn } from "@/app/lib/utils";
import { CurrencySelect } from "@/app/components/currency-select";
import { useToast } from "@/app/components/toast-provider";
import { FinancialCollapsiblePanel } from "@/app/components/financial/financial-collapsible-panel";
import { CategoryBudgetMappingPanel } from "@/app/components/financial/category-budget-mapping-panel";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
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
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";

interface BudgetWithSpending {
  id: string;
  name: string;
  limitAmount: number;
  limitAmountHome: number;
  currency: CurrencyCode;
  homeCurrency: CurrencyCode;
  period: string;
  isShared: boolean;
  userId: string | null;
  currentSpendingHomeCents: number;
  percentUsed: number;
  remainingHomeCents: number;
  alertLevel: "ok" | "warn" | "critical" | "over";
}

interface BudgetListProps {
  budgets: BudgetWithSpending[];
  session: { role: string };
  homeCurrency: CurrencyCode;
}

type BudgetFormData = {
  name: string;
  limitAmount: string;
  currency: string;
  period: string;
  isShared: boolean;
};

function emptyBudgetForm(homeCurrency: CurrencyCode): BudgetFormData {
  return {
    name: "",
    limitAmount: "",
    currency: homeCurrency,
    period: "monthly",
    isShared: false,
  };
}

function getProgressVariant(
  percent: number,
  remaining: number
): "budget-list-progress--ok" | "budget-list-progress--warn" | "budget-list-progress--danger" {
  if (remaining < 0 || percent >= 100) return "budget-list-progress--danger";
  if (percent >= 90) return "budget-list-progress--danger";
  if (percent >= 75) return "budget-list-progress--warn";
  return "budget-list-progress--ok";
}

function BudgetCard({
  budget,
  onEdit,
  onDelete,
}: {
  budget: BudgetWithSpending;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isOverBudget = budget.remainingHomeCents < 0;
  const clampedPercent = Math.min(budget.percentUsed, 100);
  const showBudgetCurrency =
    budget.currency !== budget.homeCurrency;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <CardTitle className="text-base truncate">{budget.name}</CardTitle>
            {budget.alertLevel !== "ok" && (
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase shrink-0 px-1.5 py-0.5 rounded",
                  budget.alertLevel === "over"
                    ? "bg-red-500/15 text-red-600"
                    : budget.alertLevel === "critical"
                      ? "bg-red-500/10 text-red-600"
                      : "bg-amber-500/15 text-amber-700"
                )}
              >
                {budget.alertLevel === "over"
                  ? "Over"
                  : budget.alertLevel === "critical"
                    ? "90%+"
                    : "75%+"}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              {formatCents(budget.currentSpendingHomeCents, budget.homeCurrency)} of{" "}
              {formatCents(budget.limitAmountHome, budget.homeCurrency)}
            </span>
            <span className="text-muted-foreground capitalize">
              {budget.period}
            </span>
          </div>
          {showBudgetCurrency && (
            <p className="text-xs text-muted-foreground">
              Limit in budget currency:{" "}
              {formatCents(budget.limitAmount, budget.currency)}
            </p>
          )}
          <progress
            className={cn(
              "budget-list-progress",
              getProgressVariant(budget.percentUsed, budget.remainingHomeCents)
            )}
            value={clampedPercent}
            max={100}
            aria-label={`${budget.name}: ${clampedPercent}% of budget used`}
          />
          {isOverBudget ? (
            <p className="text-sm font-medium text-red-500">
              Over budget by{" "}
              {formatCents(Math.abs(budget.remainingHomeCents), budget.homeCurrency)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {formatCents(budget.remainingHomeCents, budget.homeCurrency)} remaining
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetFormDialog({
  open,
  onOpenChange,
  title,
  form,
  setForm,
  onSubmit,
  submitting,
  error,
  recordId,
  homeCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  form: BudgetFormData;
  setForm: React.Dispatch<React.SetStateAction<BudgetFormData>>;
  onSubmit: () => void;
  submitting: boolean;
  error?: string | null;
  recordId?: string;
  homeCurrency: CurrencyCode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Groceries"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Limit</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.limitAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, limitAmount: e.target.value }))
                }
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Currency</label>
              <CurrencySelect
                value={form.currency}
                onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
              />
            </div>
          </div>
          <div>
            <label htmlFor="budget-form-period" className="text-sm font-medium">
              Period
            </label>
            <select
              id="budget-form-period"
              value={form.period}
              onChange={(e) =>
                setForm((f) => ({ ...f, period: e.target.value }))
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="budget-shared"
              checked={form.isShared}
              onChange={(e) =>
                setForm((f) => ({ ...f, isShared: e.target.checked }))
              }
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="budget-shared" className="text-sm font-medium">
              Shared (household-wide)
            </label>
          </div>
          {recordId ? (
            <AuditHistoryPanel
              recordId={recordId}
              table="budgets"
              homeCurrency={homeCurrency}
            />
          ) : null}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || !form.name || !form.limitAmount}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BudgetList({
  budgets,
  session: _session,
  homeCurrency,
}: BudgetListProps) {
  const revalidator = useRevalidator();
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithSpending | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<BudgetWithSpending | null>(null);
  const [form, setForm] = useState<BudgetFormData>(() => emptyBudgetForm(homeCurrency));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shared = budgets.filter((b) => b.isShared);
  const personal = budgets.filter((b) => !b.isShared);

  function openAdd() {
    setForm(emptyBudgetForm(homeCurrency));
    setError(null);
    setShowAdd(true);
  }

  function openEdit(budget: BudgetWithSpending) {
    setForm({
      name: budget.name,
      limitAmount: (budget.limitAmount / 100).toFixed(2),
      currency: budget.currency,
      period: budget.period,
      isShared: budget.isShared,
    });
    setError(null);
    setEditingBudget(budget);
  }

  async function handleAdd() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          limitAmount: parseFloat(form.limitAmount),
          currency: form.currency,
          period: form.period,
          isShared: form.isShared,
        }),
      });
      if (res.ok) {
        setShowAdd(false);
        revalidator.revalidate();
      } else {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message ?? "Failed to create budget");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit() {
    if (!editingBudget) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/budgets/${editingBudget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          limitAmount: parseFloat(form.limitAmount),
          currency: form.currency,
          period: form.period,
          isShared: form.isShared,
        }),
      });
      if (res.ok) {
        setEditingBudget(null);
        revalidator.revalidate();
      } else {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message ?? "Failed to update budget");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deletingBudget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/budgets/${deletingBudget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeletingBudget(null);
        revalidator.revalidate();
        return;
      }
      await toastMutationFailure(toast, res, "Delete budget");
    } catch {
      await toastMutationFailure(toast, null, "Delete budget");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Budgets</h2>
        <Button onClick={openAdd}>Add Budget</Button>
      </div>

      {shared.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Shared
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {shared.map((b) => (
              <BudgetCard
                key={b.id}
                budget={b}
                onEdit={() => openEdit(b)}
                onDelete={() => setDeletingBudget(b)}
              />
            ))}
          </div>
        </div>
      )}

      {personal.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Personal
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {personal.map((b) => (
              <BudgetCard
                key={b.id}
                budget={b}
                onEdit={() => openEdit(b)}
                onDelete={() => setDeletingBudget(b)}
              />
            ))}
          </div>
        </div>
      )}

      {budgets.length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          No budgets yet. Create one to start tracking your spending.
        </p>
      )}

      <FinancialCollapsiblePanel
        title="Category → budget linking"
        description="Choose which budget auto-selects when you log expenses in each category."
      >
        <CategoryBudgetMappingPanel />
      </FinancialCollapsiblePanel>

      {/* Add dialog */}
      <BudgetFormDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        title="Add Budget"
        form={form}
        setForm={setForm}
        onSubmit={handleAdd}
        submitting={submitting}
        error={error}
        homeCurrency={homeCurrency}
      />

      {/* Edit dialog */}
      <BudgetFormDialog
        open={editingBudget !== null}
        onOpenChange={(open) => {
          if (!open) setEditingBudget(null);
        }}
        title="Edit Budget"
        form={form}
        setForm={setForm}
        onSubmit={handleEdit}
        submitting={submitting}
        error={error}
        recordId={editingBudget?.id}
        homeCurrency={homeCurrency}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deletingBudget !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingBudget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingBudget?.name}&quot;?
              This action cannot be undone. Transactions linked to this budget
              will not be deleted but will no longer be tracked against it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={submitting}>
              {submitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
