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
import { centsToInputString, parseAmount } from "@/app/lib/decimal-input";
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
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";

export type { TransactionDTO };

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
  const t = useT();
  const locale = useLocale();
  const showOut = typeFilter !== "income";
  const showIn = typeFilter !== "expense";

  return (
    <p className="text-sm text-muted-foreground sm:text-right">
      <span className="font-mono">
        {showOut && (
          <>
            <span className="font-medium text-foreground">
              {formatSignedCents(-totals.outCents, currency, locale)}
            </span>{" "}
            {t.transactions.out}
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
              {formatSignedCents(totals.inCents, currency, locale, { showPlus: true })}
            </span>{" "}
            {t.transactions.in}
          </>
        )}
      </span>
      {totals.hasOtherCurrencies && (
        <span className="block text-xs">{t.transactions.otherCurrencies}</span>
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
  const t = useT();
  const locale = useLocale();
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
          amount: parseAmount(newTransaction.amount),
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
        setFormError(message ?? t.common.couldNot(t.transactions.addAction));
      }
    } catch (err) {
      console.error("Transaction request failed:", err);
      setFormError(t.common.couldNotConnection(t.transactions.addAction));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t.transactions.deleteTitle,
      description: t.common.cantBeUndone,
      confirmText: t.common.delete,
      variant: "destructive",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/transactions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        await toastMutationFailure(toast, res, t.transactions.deleteAction, t.common);
        return;
      }
      revalidator.revalidate();
    } catch {
      await toastMutationFailure(toast, null, t.transactions.deleteAction, t.common);
    }
  };

  const handleStartEdit = (transaction: TransactionDTO) => {
    setEditingId(transaction.id);
    setEditForm({
      amount: centsToInputString(transaction.amount, transaction.currency, locale),
      description: transaction.description || "",
      categoryId: transaction.categoryId ?? "",
      type: transaction.type,
      date: transaction.date.split("T")[0] ?? transaction.date,
      budgetId: transaction.budgetId,
      currency: transaction.currency,
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
          (await readApiErrorMessage(res)) ?? t.common.couldNot(t.transactions.exportAction)
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
      setExportError(t.common.couldNotConnection(t.transactions.exportAction));
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
          amount: parseAmount(editForm.amount),
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
        await toastMutationFailure(toast, res, t.transactions.saveAction, t.common);
      }
    } catch {
      await toastMutationFailure(toast, null, t.transactions.saveAction, t.common);
    } finally {
      setIsSubmitting(false);
    }
  };

  const groups = groupTransactionsByMonth(allTransactions, {
    homeCurrency,
    hasMore,
    locale,
  });

  return (
    <div className="space-y-6">
      <FinancialSectionHeader
        title={t.nav.transactions}
        action={
          <>
            <Button type="button" onClick={handleOpenAddForm}>
              <Plus />
              {t.transactions.add}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleExportCsv()}
            >
              <Download />
              {t.transactions.exportCsv}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <Upload />
              {t.transactions.importJson}
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

      <FinancialCollapsiblePanel title={t.transactions.manageCategories}>
        <CategoryManagementPanel />
      </FinancialCollapsiblePanel>

      {typeFilter && (
        <p className="text-sm text-muted-foreground">
          {t.transactions.showingOnly(
            typeFilter,
            <SectionLink to="/financial">{t.transactions.clearFilter}</SectionLink>
          )}
        </p>
      )}

      {allTransactions.length === 0 ? (
        <EmptyState
          message={
            typeFilter ? t.transactions.emptyFiltered(typeFilter) : t.transactions.empty
          }
          action={
            <Button type="button" onClick={handleOpenAddForm}>
              <Plus />
              {t.transactions.add}
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
            <span className="sr-only">{t.transactions.loadingMore}</span>
          </>
        )}
        {!hasMore && allTransactions.length > 0 && (
          <p className="text-sm text-muted-foreground">{t.transactions.end}</p>
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
