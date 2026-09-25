import { useState } from "react";
import { useRevalidator } from "react-router";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { toastMutationFailure } from "@/app/lib/api-error";
import { formatSignedCents } from "@/app/lib/currency";
import { formatLedgerDate } from "@/app/lib/format-dates";
import { getFrequencyLabel } from "@/app/lib/recurring-labels";
import { cn } from "@/app/lib/utils";
import { EmptyState } from "@/app/components/empty-state";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import { Switch } from "@/app/components/ui/switch";
import { Button } from "@/app/components/ui/button";
import { FinancialSectionHeader } from "@/app/components/financial-section-header";
import { FinancialCollapsiblePanel } from "@/app/components/financial/financial-collapsible-panel";
import { CategoryManagementPanel } from "@/app/components/financial/category-management-panel";
import { RowIconButton } from "@/app/components/financial/ledger-group";
import {
  AddRecurringDialog,
  EditRecurringDialog,
} from "@/app/components/recurring-dialogs";

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

function RecurringRuleRow({
  rule,
  homeCurrency,
  toggling,
  deleting,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: RecurringRule;
  homeCurrency: CurrencyCode;
  toggling: boolean;
  deleting: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isIncome = rule.type === "income";
  const title = rule.description || rule.category;

  return (
    <li className="flex items-center gap-3 py-3">
      <Switch
        checked={rule.isActive}
        disabled={toggling}
        onCheckedChange={onToggle}
        aria-label={rule.isActive ? `Pause ${title}` : `Resume ${title}`}
      />

      <div className={cn("min-w-0 flex-1", !rule.isActive && "text-muted-foreground")}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate font-semibold">{title}</span>
          <span
            className={cn(
              "shrink-0 font-mono font-medium",
              isIncome && rule.isActive && "text-success"
            )}
          >
            {formatSignedCents(isIncome ? rule.amount : -rule.amount, rule.currency, {
              showPlus: true,
            })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {rule.description ? `${rule.category} · ` : ""}
          {getFrequencyLabel(rule)} ·{" "}
          {rule.isActive ? (
            <>
              Next <span className="font-mono">{formatLedgerDate(rule.nextRunDate)}</span>
            </>
          ) : (
            "Paused"
          )}
          {rule.currency !== homeCurrency ? ` · ${rule.currency}` : ""}
        </p>
      </div>

      <div className="-mr-2 flex shrink-0">
        <RowIconButton onClick={onEdit} aria-label={`Edit ${title}`}>
          <Pencil />
        </RowIconButton>
        <RowIconButton
          tone="destructive"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Delete ${title}`}
        >
          <Trash2 />
        </RowIconButton>
      </div>
    </li>
  );
}

export function RecurringList({ rules, homeCurrency }: RecurringListProps) {
  const revalidator = useRevalidator();
  const confirm = useConfirm();
  const toast = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

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
      await toastMutationFailure(toast, res, "Update recurring transaction");
    } catch {
      await toastMutationFailure(toast, null, "Update recurring transaction");
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(rule: RecurringRule): Promise<boolean> {
    if (deleting) return false;
    setDeleting(rule.id);
    try {
      const ok = await confirm({
        title: "Delete recurring transaction?",
        description:
          "It stops creating new transactions. Ones it already posted stay.",
        confirmText: "Delete",
        variant: "destructive",
      });
      if (!ok) return false;

      const res = await fetch(`/api/recurring/${rule.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        revalidator.revalidate();
        return true;
      }
      await toastMutationFailure(toast, res, "Delete recurring transaction");
    } catch {
      await toastMutationFailure(toast, null, "Delete recurring transaction");
    } finally {
      setDeleting(null);
    }
    return false;
  }

  async function handleDeleteFromDialog() {
    if (editingRule && (await handleDelete(editingRule))) {
      setEditingRule(null);
    }
  }

  const openAdd = () => setShowAddDialog(true);

  return (
    <div className="space-y-10">
      <div>
        <FinancialSectionHeader
          title="Recurring"
          description="Each one posts automatically on its next date."
          className="border-b border-foreground pb-3"
          action={
            <Button type="button" onClick={openAdd}>
              <Plus />
              Add recurring
            </Button>
          }
        />

        {rules.length === 0 ? (
          <EmptyState
            message="No recurring transactions yet. Add rent, pay, or a subscription and it will post on schedule."
            action={
              <Button type="button" onClick={openAdd}>
                <Plus />
                Add recurring
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((rule) => (
              <RecurringRuleRow
                key={rule.id}
                rule={rule}
                homeCurrency={homeCurrency}
                toggling={toggling === rule.id}
                deleting={deleting === rule.id}
                onToggle={() => handleToggle(rule)}
                onEdit={() => setEditingRule(rule)}
                onDelete={() => void handleDelete(rule)}
              />
            ))}
          </ul>
        )}
      </div>

      <FinancialCollapsiblePanel title="Manage categories">
        <CategoryManagementPanel />
      </FinancialCollapsiblePanel>

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
        onDelete={() => void handleDeleteFromDialog()}
        deleting={editingRule !== null && deleting === editingRule.id}
      />
    </div>
  );
}
