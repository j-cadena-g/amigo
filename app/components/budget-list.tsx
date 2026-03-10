import { useState } from "react";
import { useRevalidator } from "react-router";
import { formatCents } from "@/app/lib/currency";
import { CurrencySelect } from "@/app/components/currency-select";
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

interface BudgetWithSpending {
  id: string;
  name: string;
  category: string | null;
  limitAmount: number;
  currency: CurrencyCode;
  period: string;
  isShared: boolean;
  userId: string | null;
  currentSpending: number;
  percentUsed: number;
  remainingAmount: number;
}

interface BudgetListProps {
  budgets: BudgetWithSpending[];
  session: { role: string };
}

type BudgetFormData = {
  name: string;
  category: string;
  limitAmount: string;
  currency: string;
  period: string;
  isShared: boolean;
};

const EMPTY_FORM: BudgetFormData = {
  name: "",
  category: "",
  limitAmount: "",
  currency: "CAD",
  period: "monthly",
  isShared: false,
};

function getProgressColor(percent: number): string {
  if (percent > 90) return "bg-red-500";
  if (percent >= 75) return "bg-yellow-500";
  return "bg-green-500";
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
  const isOverBudget = budget.remainingAmount < 0;
  const clampedPercent = Math.min(budget.percentUsed, 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{budget.name}</CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
        {budget.category && (
          <p className="text-sm text-muted-foreground">{budget.category}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              {formatCents(budget.currentSpending, budget.currency)} of{" "}
              {formatCents(budget.limitAmount, budget.currency)}
            </span>
            <span className="text-muted-foreground capitalize">
              {budget.period}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className={`h-2 rounded-full transition-all ${getProgressColor(budget.percentUsed)}`}
              style={{ width: `${clampedPercent}%` }}
            />
          </div>
          {isOverBudget ? (
            <p className="text-sm font-medium text-red-500">
              Over budget by{" "}
              {formatCents(Math.abs(budget.remainingAmount), budget.currency)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {formatCents(budget.remainingAmount, budget.currency)} remaining
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  form: BudgetFormData;
  setForm: React.Dispatch<React.SetStateAction<BudgetFormData>>;
  onSubmit: () => void;
  submitting: boolean;
  error?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
          <div>
            <label className="text-sm font-medium">Category</label>
            <Input
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
              placeholder="Optional category filter"
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
            <label className="text-sm font-medium">Period</label>
            <select
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

export function BudgetList({ budgets, session: _session }: BudgetListProps) {
  const revalidator = useRevalidator();
  const [showAdd, setShowAdd] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithSpending | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<BudgetWithSpending | null>(null);
  const [form, setForm] = useState<BudgetFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shared = budgets.filter((b) => b.isShared);
  const personal = budgets.filter((b) => !b.isShared);

  function openAdd() {
    setForm(EMPTY_FORM);
    setError(null);
    setShowAdd(true);
  }

  function openEdit(budget: BudgetWithSpending) {
    setForm({
      name: budget.name,
      category: budget.category ?? "",
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
          category: form.category || null,
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
          category: form.category || null,
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
      }
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
