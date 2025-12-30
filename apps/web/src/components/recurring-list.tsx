"use client";

import { useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Repeat,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Switch } from "@amigo/ui";
import {
  getRecurringRules,
  toggleRecurringRule,
  deleteRecurringRule,
} from "@/actions/recurring";
import { useConfirm } from "@/components/confirm-provider";
import { EmptyState } from "@/components/empty-state";
import { Loading } from "@/components/loading";
import type { RecurringTransaction } from "@amigo/db/schema";
import {
  AddRecurringDialog,
  EditRecurringDialog,
} from "@/components/recurring-dialogs";

function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

const FREQ_LABELS: Record<Frequency, { singular: string; plural: string }> = {
  DAILY: { singular: "day", plural: "days" },
  WEEKLY: { singular: "week", plural: "weeks" },
  MONTHLY: { singular: "month", plural: "months" },
  YEARLY: { singular: "year", plural: "years" },
};

function getFrequencyLabel(frequency: Frequency, interval: number): string {
  const label = FREQ_LABELS[frequency];
  if (interval === 1) {
    return `Every ${label.singular}`;
  }
  return `Every ${interval} ${label.plural}`;
}

export function RecurringList() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringTransaction | null>(
    null
  );
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  const { data: rules, isLoading, isError, refetch } = useQuery({
    queryKey: ["recurring-rules"],
    queryFn: () => getRecurringRules(),
  });

  const handleToggle = (id: string) => {
    startTransition(async () => {
      await toggleRecurringRule(id);
      refetch();
    });
  };

  const handleDelete = async (id: string) => {
    if (
      await confirm({
        title: "Delete Recurring Rule",
        description:
          "Are you sure you want to delete this recurring rule? This will not affect previously created transactions.",
        variant: "destructive",
        confirmText: "Delete",
      })
    ) {
      startTransition(async () => {
        await deleteRecurringRule(id);
        refetch();
      });
    }
  };

  if (isLoading) {
    return <Loading />;
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        Failed to load recurring rules. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Rule Button */}
      <button
        onClick={() => setShowAddDialog(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-muted-foreground hover:border-muted-foreground hover:text-foreground"
      >
        <Plus className="h-5 w-5" />
        Add Recurring Rule
      </button>

      {/* Rules List */}
      {!rules || rules.length === 0 ? (
        <EmptyState message="No recurring rules yet. Add one to automate your transactions." />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`rounded-lg border bg-card p-4 transition-colors ${
                !rule.active ? "border-dashed border-muted-foreground/30 bg-muted/30" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className={`rounded-full p-2 shrink-0 ${
                      rule.type === "income"
                        ? "bg-green-500/10"
                        : "bg-red-500/10"
                    }`}
                  >
                    {rule.type === "income" ? (
                      <ArrowUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <ArrowDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {rule.description || rule.category}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {rule.category}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <Repeat className="h-3 w-3" />
                        {getFrequencyLabel(rule.frequency, rule.interval)}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <Calendar className="h-3 w-3" />
                        Next: {formatDate(rule.nextRunDate)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span
                    className={`font-semibold ${
                      rule.type === "income"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {rule.type === "income" ? "+" : "-"}
                    {formatCurrency(rule.amount)}
                  </span>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className={`text-xs ${rule.active ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                        {rule.active ? "Active" : "Paused"}
                      </span>
                      <Switch
                        checked={rule.active}
                        onCheckedChange={() => handleToggle(rule.id)}
                        disabled={isPending}
                        aria-label={rule.active ? "Pause rule" : "Resume rule"}
                      />
                    </label>
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Edit rule"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Delete rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <AddRecurringDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => {
          setShowAddDialog(false);
          refetch();
        }}
      />

      {editingRule && (
        <EditRecurringDialog
          open={!!editingRule}
          onOpenChange={(open) => !open && setEditingRule(null)}
          rule={editingRule}
          onSuccess={() => {
            setEditingRule(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
