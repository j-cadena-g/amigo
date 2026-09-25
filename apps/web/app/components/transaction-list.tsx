import { useState, useEffect, useRef, useCallback } from "react";
import { useRevalidator, useSearchParams } from "react-router";
import { Download, Loader2, Plus, Upload } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { EmptyState } from "@/app/components/empty-state";
import { SectionLink } from "@/app/components/ledger";
import { Button } from "@/app/components/ui/button";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import { readApiErrorMessage, toastMutationFailure } from "@/app/lib/api-error";
import { formatSignedCents } from "@/app/lib/currency";
import { centsToInputString } from "@/app/lib/decimal-input";
import {
  groupTransactionsByMonth,
  type MonthTotals,
} from "@/app/lib/transaction-month-groups";
import { cn } from "@/app/lib/utils";
import {
  AddTransactionForm,
  type TransactionFormState,
} from "@/app/components/transaction-form";
import { TransactionImportDialog } from "@/app/components/transaction-import-dialog";
import { FinancialSectionHeader } from "@/app/components/financial-section-header";
import { FinancialCollapsiblePanel } from "@/app/components/financial/financial-collapsible-panel";
import { CategoryManagementPanel } from "@/app/components/financial/category-management-panel";
import { LedgerGroup } from "@/app/components/financial/ledger-group";
import {
  TransactionRow,
  type TransactionDTO,
} from "@/app/components/transaction-row";

export type { TransactionDTO };

const FILTER_LABELS: Record<"income" | "expense", string> = {
  income: "income",
  expense: "expenses",
};

interface TransactionListProps {
  initialTransactions: TransactionDTO[];
  currentUserId: string;
  typeFilter?: "income" | "expense" | null;
  homeCurrency: CurrencyCode;
  todayStr: string;
}

function MonthTotalsLine({
  totals,
  currency,
  typeFilter,
}: {
  totals: MonthTotals;
  currency: CurrencyCode;
  typeFilter?: "income" | "expense" | null;
}) {
  const showOut = typeFilter !== "income";
  const showIn = typeFilter !== "expense";

  return (
    <p className="text-sm text-muted-foreground sm:text-right">
      <span className="font-mono">
        {showOut && (
          <>
            <span className="font-medium text-foreground">
              {formatSignedCents(-totals.outCents, currency)}
            </span>{" "}
            out
          </>
        )}
        {showOut && showIn && " · "}
        {showIn && (
          <>
            <span
              className={cn(
                "font-medium",
                totals.inCents > 0 ? "text-success" : "text-foreground"
              )}
            >
              {formatSignedCents(totals.inCents, currency, { showPlus: true })}
            </span>{" "}
            in
          </>
        )}
      </span>
      {totals.hasOtherCurrencies && (
        <span className="block text-xs">Other currencies not included</span>
      )}
    </p>
  );
}

export function TransactionList({
  initialTransactions,
  currentUserId: _currentUserId,
  typeFilter,
  homeCurrency,
  todayStr,
}: TransactionListProps) {
  const revalidator = useRevalidator();
  const confirm = useConfirm();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [allTransactions, setAllTransactions] =
    useState<TransactionDTO[]>(initialTransactions);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialTransactions.length >= 20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showAddForm, setShowAddForm] = useState(
    () => searchParams.get("new") === "1"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allowBudgetSuggest, setAllowBudgetSuggest] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const addAmountRef = useRef<HTMLInputElement>(null);
  const lastExpenseBudgetIdRef = useRef<string | null>(null);
  const lastEditExpenseBudgetIdRef = useRef<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [newTransaction, setNewTransaction] = useState<TransactionFormState>({
    amount: "",
    description: "",
    categoryId: "",
    type: "expense",
    date: todayStr,
    budgetId: null,
    currency: homeCurrency,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<TransactionFormState>({
    amount: "",
    description: "",
    categoryId: "",
    type: "expense",
    date: "",
    budgetId: null,
    currency: homeCurrency,
  });

  useEffect(() => {
    setAllTransactions(initialTransactions);
    setPage(1);
    setHasMore(initialTransactions.length >= 20);
  }, [initialTransactions]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const filterParam = typeFilter ? `&type=${typeFilter}` : "";
      const res = await fetch(`/api/transactions?page=${nextPage}&limit=20${filterParam}`);
      if (res.ok) {
        const data = (await res.json()) as {
          data: TransactionDTO[];
          pagination: { hasMore: boolean };
        };
        setAllTransactions((prev) => [...prev, ...data.data]);
        setPage(nextPage);
        setHasMore(data.pagination.hasMore);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [page, hasMore, isLoadingMore, typeFilter]);

  useEffect(() => {
    if (newTransaction.type === "expense") {
      lastExpenseBudgetIdRef.current = newTransaction.budgetId;
    }
  }, [newTransaction.type, newTransaction.budgetId]);

  useEffect(() => {
    if (editingId && editForm.type === "expense") {
      lastEditExpenseBudgetIdRef.current = editForm.budgetId;
    }
  }, [editingId, editForm.type, editForm.budgetId]);

  const handleOpenAddForm = () => {
    if (showAddForm) {
      addAmountRef.current?.focus();
      return;
    }
    lastExpenseBudgetIdRef.current = null;
    setAllowBudgetSuggest(true);
    setNewTransaction((prev) => ({
      ...prev,
      currency: homeCurrency,
      date: todayStr,
    }));
    setShowAddForm(true);
  };

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(newTransaction.amount),
          description: newTransaction.description || undefined,
          categoryId: newTransaction.categoryId,
          type: newTransaction.type,
          date: newTransaction.date,
          budgetId: newTransaction.budgetId,
          currency: newTransaction.currency,
        }),
      });
      if (res.ok) {
        lastExpenseBudgetIdRef.current = null;
        setNewTransaction({
          amount: "",
          description: "",
          categoryId: "",
          type: "expense",
          date: todayStr,
          budgetId: null,
          currency: homeCurrency,
        });
        setShowAddForm(false);
        setFormError(null);
        revalidator.revalidate();
      } else {
        const message = await readApiErrorMessage(res);
        console.error("Failed to add transaction:", res.status, message);
        setFormError(message ?? "Couldn't add the transaction. Try again.");
      }
    } catch (err) {
      console.error("Transaction request failed:", err);
      setFormError("Couldn't add the transaction. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete transaction?",
      description: "This can't be undone.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/transactions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        await toastMutationFailure(toast, res, "Delete transaction");
        return;
      }
      revalidator.revalidate();
    } catch {
      await toastMutationFailure(toast, null, "Delete transaction");
    }
  };

  const handleStartEdit = (t: TransactionDTO) => {
    setEditingId(t.id);
    setEditForm({
      amount: centsToInputString(t.amount),
      description: t.description || "",
      categoryId: t.categoryId ?? "",
      type: t.type,
      date: t.date.split("T")[0] ?? t.date,
      budgetId: t.budgetId,
      currency: t.currency,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleExportCsv = async () => {
    setExportError(null);
    try {
      const res = await fetch("/api/transactions/export");
      if (!res.ok) {
        setExportError(
          (await readApiErrorMessage(res)) ?? "Couldn't export transactions. Try again."
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transactions-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Couldn't export transactions. Check your connection and try again.");
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/transactions/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(editForm.amount),
          description: editForm.description || null,
          categoryId: editForm.categoryId,
          type: editForm.type,
          date: editForm.date,
          budgetId: editForm.budgetId,
          currency: editForm.currency,
        }),
      });
      if (res.ok) {
        handleCancelEdit();
        revalidator.revalidate();
      } else {
        await toastMutationFailure(toast, res, "Save transaction");
      }
    } catch {
      await toastMutationFailure(toast, null, "Save transaction");
    } finally {
      setIsSubmitting(false);
    }
  };

  const groups = groupTransactionsByMonth(allTransactions, { homeCurrency, hasMore });

  return (
    <div className="space-y-6">
      <FinancialSectionHeader
        title="Transactions"
        action={
          <>
            <Button type="button" onClick={handleOpenAddForm}>
              <Plus />
              Add transaction
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleExportCsv()}
            >
              <Download />
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <Upload />
              Import JSON
            </Button>
          </>
        }
      />
      {exportError && (
        <p className="text-sm text-destructive" role="alert">
          {exportError}
        </p>
      )}

      {showAddForm && (
        <AddTransactionForm
          form={newTransaction}
          isSubmitting={isSubmitting}
          formError={formError}
          allowBudgetSuggest={allowBudgetSuggest}
          lastExpenseBudgetIdRef={lastExpenseBudgetIdRef}
          onChange={setNewTransaction}
          onAllowBudgetSuggestChange={setAllowBudgetSuggest}
          onCancel={() => {
            setShowAddForm(false);
            setFormError(null);
          }}
          onSubmit={handleAddTransaction}
          amountRef={addAmountRef}
        />
      )}

      <FinancialCollapsiblePanel title="Manage categories">
        <CategoryManagementPanel />
      </FinancialCollapsiblePanel>

      {typeFilter && (
        <p className="text-sm text-muted-foreground">
          Showing {FILTER_LABELS[typeFilter]} only ·{" "}
          <SectionLink to="/financial">Clear filter</SectionLink>
        </p>
      )}

      {allTransactions.length === 0 ? (
        <EmptyState
          message={
            typeFilter
              ? `No ${typeFilter} transactions yet.`
              : "No transactions yet. Add one, or import a JSON file."
          }
          action={
            <Button type="button" onClick={handleOpenAddForm}>
              <Plus />
              Add transaction
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <LedgerGroup
              key={group.month}
              title={group.label}
              aside={
                group.totals ? (
                  <MonthTotalsLine
                    totals={group.totals}
                    currency={homeCurrency}
                    typeFilter={typeFilter}
                  />
                ) : undefined
              }
            >
              <ul className="divide-y divide-border">
                {group.transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    homeCurrency={homeCurrency}
                    expanded={expandedId === transaction.id}
                    isEditing={editingId === transaction.id}
                    isSubmitting={isSubmitting}
                    lastEditExpenseBudgetIdRef={lastEditExpenseBudgetIdRef}
                    onToggleExpand={() =>
                      setExpandedId(expandedId === transaction.id ? null : transaction.id)
                    }
                    onStartEdit={() => handleStartEdit(transaction)}
                    onCancelEdit={handleCancelEdit}
                    onSaveEdit={handleSaveEdit}
                    onDelete={() => void handleDelete(transaction.id)}
                    editForm={editForm}
                    onEditFormChange={setEditForm}
                  />
                ))}
              </ul>
            </LedgerGroup>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="flex justify-center py-4">
        {isLoadingMore && (
          <>
            <Loader2 aria-hidden className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="sr-only">Loading more transactions…</span>
          </>
        )}
        {!hasMore && allTransactions.length > 0 && (
          <p className="text-sm text-muted-foreground">{"That's everything."}</p>
        )}
      </div>

      <TransactionImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => revalidator.revalidate()}
      />
    </div>
  );
}
