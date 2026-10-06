import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  chargePayload,
  type TransactionFormState,
} from "@/app/components/transaction-form";
import { TransactionImportDialog } from "@/app/components/transaction-import-dialog";
import { FinancialSectionHeader } from "@/app/components/financial-section-header";
import { FinancialCollapsiblePanel } from "@/app/components/financial/financial-collapsible-panel";
import { CategoryManagementPanel } from "@/app/components/financial/category-management-panel";
import { LedgerGroup } from "@/app/components/financial/ledger-group";
import {
  TransactionRow,
  type TransactionAccount,
  type TransactionDTO,
} from "@/app/components/transaction-row";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";
import {
  hasNewFutureReminders,
  reminderTimeToLocal,
  ReminderTimeError,
  transactionReminderPayload,
} from "@/app/lib/reminder-times";
import { PushError, pushErrorCode, setNotificationCategory } from "@/app/lib/push/client";

export type { TransactionDTO };

interface TransactionListProps {
  initialTransactions: TransactionDTO[];
  currentUserId: string;
  typeFilter?: "income" | "expense" | null;
  /** Id of the account the list is narrowed to, if any. */
  accountFilter?: string | null;
  /** The household's visible accounts, archived included, to name each row's account. */
  accounts: TransactionAccount[];
  homeCurrency: CurrencyCode;
  todayStr: string;
  timeZone: string;
}

/** The transactions list URL with whichever filters are given. */
function financialHref(filters: { type?: string | null; account?: string | null }) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.account) params.set("account", filters.account);
  const query = params.toString();
  return query ? `/financial?${query}` : "/financial";
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
  accountFilter,
  accounts,
  homeCurrency,
  todayStr,
  timeZone,
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

  // Adding while filtered to an account starts on that account, so the new row stays in view.
  const filterAccountId =
    accountFilter && accounts.some((a) => a.id === accountFilter) ? accountFilter : null;

  const [importOpen, setImportOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [newTransaction, setNewTransaction] = useState<TransactionFormState>({
    amount: "",
    description: "",
    categoryId: "",
    type: "expense",
    date: todayStr,
    budgetId: null,
    accountId: filterAccountId,
    currency: homeCurrency,
    chargedAmount: "",
    chargedCurrency: null,
    reminderTimes: [],
  });
  const editingReminderTimesRef = useRef<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<TransactionFormState>({
    amount: "",
    description: "",
    categoryId: "",
    type: "expense",
    date: "",
    budgetId: null,
    accountId: null,
    currency: homeCurrency,
    chargedAmount: "",
    chargedCurrency: null,
    reminderTimes: [],
  });

  useEffect(() => {
    setAllTransactions(initialTransactions);
    setPage(1);
    setHasMore(initialTransactions.length >= 20);
  }, [initialTransactions]);

  // A page requested under one filter must not land in the list after the filter changes.
  const filterKey = `${typeFilter ?? ""}|${accountFilter ?? ""}`;
  const filterKeyRef = useRef(filterKey);
  filterKeyRef.current = filterKey;

  // The draft follows the account filter unless someone picked a different account.
  const draftFilterAccountRef = useRef(filterAccountId);
  useEffect(() => {
    const previous = draftFilterAccountRef.current;
    draftFilterAccountRef.current = filterAccountId;
    if (previous === filterAccountId) return;
    setNewTransaction((prev) =>
      prev.accountId === previous ? { ...prev, accountId: filterAccountId } : prev
    );
  }, [filterAccountId]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const requestedFilterKey = filterKey;
      const filterParam =
        (typeFilter ? `&type=${typeFilter}` : "") +
        (accountFilter ? `&account=${encodeURIComponent(accountFilter)}` : "");
      const res = await fetch(`/api/transactions?page=${nextPage}&limit=20${filterParam}`);
      if (res.ok) {
        const data = (await res.json()) as {
          data: TransactionDTO[];
          pagination: { hasMore: boolean };
        };
        if (filterKeyRef.current !== requestedFilterKey) return;
        setAllTransactions((prev) => [...prev, ...data.data]);
        setPage(nextPage);
        setHasMore(data.pagination.hasMore);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [page, hasMore, isLoadingMore, typeFilter, accountFilter, filterKey]);

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
      accountId: prev.accountId ?? filterAccountId,
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
      const reminderTimes = transactionReminderPayload(newTransaction.reminderTimes, timeZone);
      // Start permission setup directly from the submit gesture, before any other await.
      if (hasNewFutureReminders(reminderTimes)) {
        await setNotificationCategory("transactionNotifications", true);
      }
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
          accountId: newTransaction.accountId,
          currency: newTransaction.currency,
          ...chargePayload(newTransaction, homeCurrency),
          reminderTimes,
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
          accountId: filterAccountId,
          currency: homeCurrency,
          chargedAmount: "",
          chargedCurrency: null,
          reminderTimes: [],
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
      setFormError(err instanceof ReminderTimeError
        ? t.transactions.reminderErrors[err.code]
        : err instanceof PushError
          ? t.notifications.turnOnFailed(t.notifications.reason[pushErrorCode(err)])
          : t.common.couldNotConnection(t.transactions.addAction));
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
    editingReminderTimesRef.current = transaction.reminderTimes ?? [];
    setEditForm({
      amount: centsToInputString(transaction.amount, transaction.currency, locale),
      description: transaction.description || "",
      categoryId: transaction.categoryId ?? "",
      type: transaction.type,
      date: transaction.date.split("T")[0] ?? transaction.date,
      budgetId: transaction.budgetId,
      accountId: transaction.accountId,
      currency: transaction.currency,
      chargedAmount:
        transaction.chargedAmount != null && transaction.chargedCurrency
          ? centsToInputString(transaction.chargedAmount, transaction.chargedCurrency, locale)
          : "",
      chargedCurrency:
        transaction.chargedAmount != null ? transaction.chargedCurrency : null,
      reminderTimes: (transaction.reminderTimes ?? []).map((time) => reminderTimeToLocal(time, timeZone)),
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
    if (!editingId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const reminderTimes = transactionReminderPayload(editForm.reminderTimes, timeZone, editingReminderTimesRef.current);
      if (hasNewFutureReminders(reminderTimes, editingReminderTimesRef.current)) {
        await setNotificationCategory("transactionNotifications", true);
      }
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
          accountId: editForm.accountId,
          currency: editForm.currency,
          ...chargePayload(editForm, homeCurrency),
          reminderTimes,
        }),
      });
      if (res.ok) {
        handleCancelEdit();
        revalidator.revalidate();
      } else {
        await toastMutationFailure(toast, res, t.transactions.saveAction, t.common);
      }
    } catch (error) {
      if (error instanceof ReminderTimeError) {
        toast(t.transactions.reminderErrors[error.code], { variant: "error" });
      } else if (error instanceof PushError) {
        toast(t.notifications.turnOnFailed(t.notifications.reason[pushErrorCode(error)]), { variant: "error" });
      } else {
        await toastMutationFailure(toast, null, t.transactions.saveAction, t.common);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  // A filter on an account that is gone (deleted) still applies, so the empty list is explained.
  const filterAccountName = accountFilter
    ? (accountsById.get(accountFilter)?.name ?? t.transactions.archivedAccount)
    : null;

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
              {t.imports.title}
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
          homeCurrency={homeCurrency}
          timeZone={timeZone}
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
          accountLabel={
            newTransaction.accountId ? accountsById.get(newTransaction.accountId)?.name : undefined
          }
        />
      )}

      <FinancialCollapsiblePanel title={t.transactions.manageCategories}>
        <CategoryManagementPanel />
      </FinancialCollapsiblePanel>

      {typeFilter && (
        <p className="text-sm text-muted-foreground">
          {t.transactions.showingOnly(
            typeFilter,
            <SectionLink to={financialHref({ account: accountFilter })}>
              {t.transactions.clearFilter}
            </SectionLink>
          )}
        </p>
      )}

      {filterAccountName && (
        <p className="text-sm text-muted-foreground">
          {t.transactions.showingAccount(
            filterAccountName,
            <SectionLink to={financialHref({ type: typeFilter })}>
              {t.transactions.clearFilter}
            </SectionLink>
          )}
        </p>
      )}

      {allTransactions.length === 0 ? (
        <EmptyState
          message={
            filterAccountName
              ? t.transactions.emptyAccount(filterAccountName)
              : typeFilter
                ? t.transactions.emptyFiltered(typeFilter)
                : t.transactions.empty
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
                    account={
                      transaction.accountId
                        ? accountsById.get(transaction.accountId)
                        : undefined
                    }
                    typeFilter={typeFilter}
                    homeCurrency={homeCurrency}
                    timeZone={timeZone}
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
        accounts={accounts.filter((account) => !account.archived)}
        onOpenChange={setImportOpen}
        onImported={() => revalidator.revalidate()}
      />
    </div>
  );
}
