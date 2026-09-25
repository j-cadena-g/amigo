import { useId, useState } from "react";
import { useRevalidator } from "react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { readApiErrorMessage, toastMutationFailure } from "@/app/lib/api-error";
import { formatCents } from "@/app/lib/currency";
import { centsToInputString } from "@/app/lib/decimal-input";
import { cn } from "@/app/lib/utils";
import { CurrencySelect } from "@/app/components/currency-select";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import { EmptyState } from "@/app/components/empty-state";
import { FinancialSectionHeader } from "@/app/components/financial-section-header";
import { FinancialCollapsiblePanel } from "@/app/components/financial/financial-collapsible-panel";
import { CategoryBudgetMappingPanel } from "@/app/components/financial/category-budget-mapping-panel";
import {
  DeleteButton,
  NativeSelect,
  SharedCheckbox,
} from "@/app/components/financial/form-controls";
import { LedgerSubgroup, RowIconButton } from "@/app/components/financial/ledger-group";
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";

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

type ProgressVariant =
  | "budget-list-progress--ok"
  | "budget-list-progress--warn"
  | "budget-list-progress--danger";

function getProgressVariant(percent: number, remaining: number): ProgressVariant {
  if (remaining < 0) return "budget-list-progress--danger";
  if (percent >= 75) return "budget-list-progress--warn";
  return "budget-list-progress--ok";
}

const PROGRESS_TEXT: Record<ProgressVariant, string> = {
  "budget-list-progress--ok": "text-muted-foreground",
  "budget-list-progress--warn": "text-warning",
  "budget-list-progress--danger": "text-destructive",
};

const SUBMIT_LABELS = {
  add: { idle: "Add budget", busy: "Adding…" },
  edit: { idle: "Save budget", busy: "Saving…" },
} as const;

const ALERT_LABELS: Record<BudgetWithSpending["alertLevel"], string | null> = {
  ok: null,
  warn: "75%+ used",
  critical: "90%+ used",
  over: "Over",
};

function BudgetRow({
  budget,
  onEdit,
  onDelete,
  deleting,
}: {
  budget: BudgetWithSpending;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const isOverBudget = budget.remainingHomeCents < 0;
  const clampedPercent = Math.min(budget.percentUsed, 100);
  const variant = getProgressVariant(budget.percentUsed, budget.remainingHomeCents);
  const alert = ALERT_LABELS[budget.alertLevel];
  const showBudgetCurrency = budget.currency !== budget.homeCurrency;

  return (
    <li className="flex items-start gap-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <p className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-semibold">{budget.name}</span>
            {alert && (
              <span
                className={cn(
                  "shrink-0 text-xs font-semibold",
                  budget.alertLevel === "over" ? "text-destructive" : "text-warning"
                )}
              >
                {alert}
              </span>
            )}
          </p>
          <p className="shrink-0 font-mono text-sm font-medium">
            {formatCents(budget.currentSpendingHomeCents, budget.homeCurrency)} of{" "}
            {formatCents(budget.limitAmountHome, budget.homeCurrency)}
          </p>
        </div>
        <progress
          className={cn("budget-list-progress mt-2", variant)}
          value={clampedPercent}
          max={100}
          aria-label={
            isOverBudget
              ? `${budget.name}: over budget`
              : `${budget.name}: ${Math.round(clampedPercent)}% of budget used`
          }
        />
        <div className="mt-1.5 flex items-baseline justify-between gap-4 text-sm">
          <span className={cn("font-mono font-medium", PROGRESS_TEXT[variant])}>
            {isOverBudget
              ? `${formatCents(-budget.remainingHomeCents, budget.homeCurrency)} over`
              : `${formatCents(budget.remainingHomeCents, budget.homeCurrency)} left`}
          </span>
          <span className="text-muted-foreground capitalize">{budget.period}</span>
        </div>
        {showBudgetCurrency && (
          <p className="mt-1 text-xs text-muted-foreground">
            Limit in budget currency:{" "}
            <span className="font-mono font-medium">
              {formatCents(budget.limitAmount, budget.currency)}
            </span>
          </p>
        )}
      </div>
      <div className="-mr-2 flex shrink-0">
        <RowIconButton onClick={onEdit} aria-label={`Edit ${budget.name}`}>
          <Pencil />
        </RowIconButton>
        <RowIconButton
          tone="destructive"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Delete ${budget.name}`}
        >
          <Trash2 />
        </RowIconButton>
      </div>
    </li>
  );
}

function BudgetFormDialog({
  open,
  onOpenChange,
  mode,
  form,
  setForm,
  onSubmit,
  submitting,
  error,
  recordId,
  homeCurrency,
  onDelete,
  deleting = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  form: BudgetFormData;
  setForm: React.Dispatch<React.SetStateAction<BudgetFormData>>;
  onSubmit: () => void;
  submitting: boolean;
  error?: string | null;
  recordId?: string;
  homeCurrency: CurrencyCode;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const nameId = useId();
  const limitId = useId();
  const currencyId = useId();
  const periodId = useId();
  const busy = submitting || deleting;
  const labels = SUBMIT_LABELS[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add budget" : "Edit budget"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-sm font-semibold">
              Name
            </label>
            <Input
              id={nameId}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Groceries"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor={limitId} className="text-sm font-semibold">
                Limit
              </label>
              <Input
                id={limitId}
                type="number"
                step="0.01"
                min="0"
                value={form.limitAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, limitAmount: e.target.value }))
                }
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
                value={form.currency}
                onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={periodId} className="text-sm font-semibold">
              Period
            </label>
            <NativeSelect
              id={periodId}
              value={form.period}
              onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </NativeSelect>
          </div>
          <SharedCheckbox
            checked={form.isShared}
            onCheckedChange={(isShared) => setForm((f) => ({ ...f, isShared }))}
          />
          {recordId ? (
            <AuditHistoryPanel
              recordId={recordId}
              table="budgets"
              homeCurrency={homeCurrency}
            />
          ) : null}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            {onDelete && (
              <DeleteButton onClick={onDelete} disabled={busy} className="sm:mr-auto">
                <Trash2 />
                {deleting ? "Deleting…" : "Delete"}
              </DeleteButton>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !form.name || !form.limitAmount}>
              {submitting ? labels.busy : labels.idle}
            </Button>
          </DialogFooter>
        </form>
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
  const confirm = useConfirm();
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithSpending | null>(null);
  const [form, setForm] = useState<BudgetFormData>(() => emptyBudgetForm(homeCurrency));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      limitAmount: centsToInputString(budget.limitAmount),
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
        setError((await readApiErrorMessage(res)) ?? "Couldn't add the budget. Try again.");
      }
    } catch {
      setError("Couldn't add the budget. Check your connection and try again.");
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
        setError((await readApiErrorMessage(res)) ?? "Couldn't save the budget. Try again.");
      }
    } catch {
      setError("Couldn't save the budget. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(budget: BudgetWithSpending): Promise<boolean> {
    if (deletingId) return false;
    setDeletingId(budget.id);
    try {
      const ok = await confirm({
        title: "Delete budget?",
        description: `This can't be undone. Transactions linked to "${budget.name}" stay, but they won't count toward a budget anymore.`,
        confirmText: "Delete",
        variant: "destructive",
      });
      if (!ok) return false;

      const res = await fetch(`/api/budgets/${budget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        revalidator.revalidate();
        return true;
      }
      await toastMutationFailure(toast, res, "Delete budget");
    } catch {
      await toastMutationFailure(toast, null, "Delete budget");
    } finally {
      setDeletingId(null);
    }
    return false;
  }

  async function handleDeleteFromDialog() {
    if (editingBudget && (await handleDelete(editingBudget))) {
      setEditingBudget(null);
    }
  }

  function renderRows(items: BudgetWithSpending[]) {
    return items.map((b) => (
      <BudgetRow
        key={b.id}
        budget={b}
        onEdit={() => openEdit(b)}
        onDelete={() => void handleDelete(b)}
        deleting={deletingId === b.id}
      />
    ));
  }

  return (
    <div className="space-y-10">
      <div>
        <FinancialSectionHeader
          title="Budgets"
          className="border-b border-foreground pb-3"
          action={
            <Button type="button" onClick={openAdd}>
              <Plus />
              Add budget
            </Button>
          }
        />

        {budgets.length === 0 ? (
          <EmptyState
            message="No budgets yet. Set a monthly limit for a category, like groceries."
            action={
              <Button type="button" onClick={openAdd}>
                <Plus />
                Add budget
              </Button>
            }
          />
        ) : (
          <>
            {shared.length > 0 && (
              <LedgerSubgroup title="Shared" level={3}>
                {renderRows(shared)}
              </LedgerSubgroup>
            )}
            {personal.length > 0 && (
              <LedgerSubgroup title="Personal" level={3}>
                {renderRows(personal)}
              </LedgerSubgroup>
            )}
          </>
        )}
      </div>

      <FinancialCollapsiblePanel
        title="Category → budget linking"
        description="Pick the budget that's filled in when you log an expense in each category."
      >
        <CategoryBudgetMappingPanel />
      </FinancialCollapsiblePanel>

      <BudgetFormDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        mode="add"
        form={form}
        setForm={setForm}
        onSubmit={handleAdd}
        submitting={submitting}
        error={error}
        homeCurrency={homeCurrency}
      />

      <BudgetFormDialog
        open={editingBudget !== null}
        onOpenChange={(open) => {
          if (!open) setEditingBudget(null);
        }}
        mode="edit"
        form={form}
        setForm={setForm}
        onSubmit={handleEdit}
        submitting={submitting}
        error={error}
        recordId={editingBudget?.id}
        homeCurrency={homeCurrency}
        onDelete={() => void handleDeleteFromDialog()}
        deleting={editingBudget !== null && deletingId === editingBudget.id}
      />
    </div>
  );
}
