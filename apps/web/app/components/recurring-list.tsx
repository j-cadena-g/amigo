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
import { useLocale } from "@/app/lib/use-locale";
import { useLanguage, useT } from "@/app/i18n";
import type { RecurringReminderSchedule } from "@/app/lib/recurring-reminder-schedules";

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
  accountId: string | null;
  createdAt: number;
  reminderSchedules?: RecurringReminderSchedule[];
}

interface RecurringListProps {
  rules: RecurringRule[];
  homeCurrency: CurrencyCode;
  timeZone: string;
}

export function RecurringRuleRow({
  rule,
  homeCurrency,
  timeZone,
  toggling,
  deleting,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: RecurringRule;
  homeCurrency: CurrencyCode;
  timeZone: string;
  toggling: boolean;
  deleting: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const locale = useLocale();
  const isIncome = rule.type === "income";
  const title = rule.description || rule.category;
  const ended = Boolean(rule.endDate && rule.nextRunDate > rule.endDate);

  return (
    <li className="flex items-center gap-3 py-3">
      <Switch
        checked={rule.isActive}
        disabled={toggling}
        onCheckedChange={onToggle}
        aria-label={ended
          ? rule.isActive ? t.recurring.pauseReminders(title) : t.recurring.resumeReminders(title)
          : rule.isActive ? t.recurring.pause(title) : t.recurring.resume(title)}
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
            {formatSignedCents(isIncome ? rule.amount : -rule.amount, rule.currency, locale, {
              showPlus: true,
            })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {rule.description ? `${rule.category} · ` : ""}
          {getFrequencyLabel(rule, language)} ·{" "}
          {rule.isActive && ended ? (
            <>{t.recurring.ended} · {t.recurring.finalOccurrenceCompleted}</>
          ) : rule.isActive ? (
            <>
              {t.recurring.next} <span className="font-mono">{formatLedgerDate(rule.nextRunDate, locale)}</span>
            </>
          ) : (
            t.recurring.paused
          )}
          {rule.currency !== homeCurrency ? ` · ${rule.currency}` : ""}
        </p>
        {!!rule.reminderSchedules?.length && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t.recurring.reminderCount(rule.reminderSchedules.length)} · {rule.reminderSchedules
              .map(({ dayOffset, time }) => t.recurring.reminderTiming(dayOffset, time)).join("; ")} · {timeZone}
          </p>
        )}
      </div>

      <div className="-mr-2 flex shrink-0">
        <RowIconButton onClick={onEdit} aria-label={t.recurring.editNamed(title)}>
          <Pencil />
        </RowIconButton>
        <RowIconButton
          tone="destructive"
          onClick={onDelete}
          disabled={deleting}
          aria-label={t.recurring.deleteNamed(title)}
        >
          <Trash2 />
        </RowIconButton>
      </div>
    </li>
  );
}

export function RecurringList({ rules, homeCurrency, timeZone }: RecurringListProps) {
  const t = useT();
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
      await toastMutationFailure(toast, res, t.recurring.updateAction, t.common);
    } catch {
      await toastMutationFailure(toast, null, t.recurring.updateAction, t.common);
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(rule: RecurringRule): Promise<boolean> {
    if (deleting) return false;
    setDeleting(rule.id);
    try {
      const ok = await confirm({
        title: t.recurring.deleteTitle,
        description: t.recurring.deleteBody,
        confirmText: t.common.delete,
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
      await toastMutationFailure(toast, res, t.recurring.deleteAction, t.common);
    } catch {
      await toastMutationFailure(toast, null, t.recurring.deleteAction, t.common);
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
          title={t.nav.recurring}
          description={t.recurring.intro}
          className="border-b border-foreground pb-3"
          action={
            <Button type="button" onClick={openAdd}>
              <Plus />
              {t.recurring.add}
            </Button>
          }
        />

        {rules.length === 0 ? (
          <EmptyState
            message={t.recurring.empty}
            action={
              <Button type="button" onClick={openAdd}>
                <Plus />
                {t.recurring.add}
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
                timeZone={timeZone}
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

      <FinancialCollapsiblePanel title={t.transactions.manageCategories}>
        <CategoryManagementPanel />
      </FinancialCollapsiblePanel>

      <AddRecurringDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        defaultCurrency={homeCurrency}
        timeZone={timeZone}
      />

      <EditRecurringDialog
        open={editingRule !== null}
        onOpenChange={(open) => {
          if (!open) setEditingRule(null);
        }}
        rule={editingRule}
        timeZone={timeZone}
        homeCurrency={homeCurrency}
        onDelete={() => void handleDeleteFromDialog()}
        deleting={editingRule !== null && deleting === editingRule.id}
      />
    </div>
  );
}
