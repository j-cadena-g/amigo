import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useRevalidator } from "react-router";
import { Loader2, Download, Upload } from "lucide-react";
import { EmptyState } from "@/app/components/empty-state";
import type { CurrencyCode } from "@amigo/db";
import { Button } from "@/app/components/ui/button";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import {
  AddTransactionButton,
  AddTransactionForm,
  type TransactionFormState,
} from "@/app/components/transaction-form";
import { TransactionImportDialog } from "@/app/components/transaction-import-dialog";
import {
  TransactionRow,
  type TransactionDTO,
} from "@/app/components/transaction-row";

export type { TransactionDTO };

interface TransactionListProps {
  initialTransactions: TransactionDTO[];
  currentUserId: string;
  typeFilter?: "income" | "expense" | null;
  homeCurrency: CurrencyCode;
  todayStr: string;
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
  const [allTransactions, setAllTransactions] =
    useState<TransactionDTO[]>(initialTransactions);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialTransactions.length >= 20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allowBudgetSuggest, setAllowBudgetSuggest] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastExpenseBudgetIdRef = useRef<string | null>(null);
  const lastEditExpenseBudgetIdRef = useRef<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [newTransaction, setNewTransaction] = useState<TransactionFormState>({
    amount: "",
    description: "",
    category: "",
    type: "expense",
    date: "",
    budgetId: null,
    currency: homeCurrency,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<TransactionFormState>({
    amount: "",
    description: "",
    category: "",
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
          category: newTransaction.category || "Uncategorized",
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
          category: "",
          type: "expense",
          date: todayStr,
          budgetId: null,
          currency: homeCurrency,
        });
        setShowAddForm(false);
        setFormError(null);
        revalidator.revalidate();
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        console.error("Failed to add transaction:", res.status, err);
        setFormError(
          (err as { error?: string }).error ?? "Something went wrong. Please try again."
        );
      }
    } catch (err) {
      console.error("Transaction request failed:", err);
      setFormError("Network error — could not reach the server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete transaction?",
      description: "This cannot be undone.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast(body?.error ?? "Failed to delete transaction", { variant: "error" });
        return;
      }
      revalidator.revalidate();
    } catch {
      toast("Failed to delete transaction — check your connection", {
        variant: "error",
      });
    }
  };

  const handleStartEdit = (t: TransactionDTO) => {
    setEditingId(t.id);
    setEditForm({
      amount: String(t.amount / 100),
      description: t.description || "",
      category: t.category,
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
        setExportError(`Export failed (${res.status}). Try again or check your connection.`);
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
      setExportError("Export failed — could not reach the server.");
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/transactions/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(editForm.amount),
          description: editForm.description || null,
          category: editForm.category,
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
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast(body?.error ?? "Failed to save changes", { variant: "error" });
      }
    } catch {
      toast("Failed to save changes — check your connection", { variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {typeFilter && (
        <div className="flex items-center justify-between rounded-lg bg-secondary/50 px-4 py-2">
          <span className="text-sm text-muted-foreground">
            Showing: <span className="font-medium text-foreground capitalize">{typeFilter}</span>
          </span>
          <Link to="/budget" className="text-sm font-medium text-primary hover:text-primary/80">
            Clear filter
          </Link>
        </div>
      )}

      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void handleExportCsv()}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4" />
            Import JSON
          </Button>
        </div>
        {exportError && <p className="text-sm text-destructive">{exportError}</p>}
      </div>

      <TransactionImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => revalidator.revalidate()}
      />

      {showAddForm ? (
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
        />
      ) : (
        <AddTransactionButton onClick={handleOpenAddForm} />
      )}

      {allTransactions.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          description="Add your first transaction to start tracking."
        />
      ) : (
        <div className="divide-y divide-border rounded-lg border bg-card">
          {allTransactions.map((transaction) => (
            <div key={transaction.id}>
              <TransactionRow
                transaction={transaction}
                todayStr={todayStr}
                expanded={expandedId === transaction.id}
                isEditing={editingId === transaction.id}
                isSubmitting={isSubmitting}
                homeCurrency={homeCurrency}
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
            </div>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="flex justify-center py-4">
        {isLoadingMore && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
        {!hasMore && allTransactions.length > 0 && (
          <p className="text-sm text-muted-foreground">No more transactions</p>
        )}
      </div>
    </div>
  );
}
