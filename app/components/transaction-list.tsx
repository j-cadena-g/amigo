import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useRevalidator } from "react-router";
import { Loader2, Plus, Trash2, ArrowDown, ArrowUp, Pencil, ChevronDown } from "lucide-react";
import { EmptyState } from "@/app/components/empty-state";
import { BudgetSelect } from "@/app/components/budget-select";
import { CurrencySelect } from "@/app/components/currency-select";
import { formatCents } from "@/app/lib/currency";
import type { CurrencyCode } from "@amigo/db";

interface TransactionDTO {
  id: string;
  userId: string | null;
  amount: number;
  currency: CurrencyCode;
  category: string;
  description: string | null;
  type: "income" | "expense";
  date: string;
  budgetId: string | null;
  createdAt: number;
}

function formatDate(date: string): string {
  const dateOnly = date.split("T")[0]!;
  const d = new Date(dateOnly + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface TransactionListProps {
  initialTransactions: TransactionDTO[];
  currentUserId: string;
  typeFilter?: "income" | "expense" | null;
}

export function TransactionList({
  initialTransactions,
  currentUserId: _currentUserId,
  typeFilter,
}: TransactionListProps) {
  const revalidator = useRevalidator();
  const [allTransactions, setAllTransactions] =
    useState<TransactionDTO[]>(initialTransactions);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialTransactions.length >= 20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [newTransaction, setNewTransaction] = useState({
    amount: "",
    description: "",
    category: "",
    type: "expense" as "income" | "expense",
    budgetId: null as string | null,
    currency: "CAD" as CurrencyCode,
  });

  const [editForm, setEditForm] = useState({
    amount: "",
    description: "",
    category: "",
    type: "expense" as "income" | "expense",
    date: "",
    budgetId: null as string | null,
    currency: "CAD" as CurrencyCode,
  });

  // Sync with loader data
  useEffect(() => {
    setAllTransactions(initialTransactions);
    setPage(1);
    setHasMore(initialTransactions.length >= 20);
  }, [initialTransactions]);

  // Infinite scroll
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const filterParam = typeFilter ? `&type=${typeFilter}` : "";
      const res = await fetch(`/api/transactions?page=${nextPage}&limit=20${filterParam}`);
      if (res.ok) {
        const data = (await res.json()) as { data: TransactionDTO[]; pagination: { hasMore: boolean } };
        setAllTransactions((prev) => [...prev, ...data.data]);
        setPage(nextPage);
        setHasMore(data.pagination.hasMore);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [page, hasMore, isLoadingMore, typeFilter]);

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
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(newTransaction.amount),
          description: newTransaction.description || undefined,
          category: newTransaction.category || "Uncategorized",
          type: newTransaction.type,
          date: new Date().toISOString(),
          budgetId: newTransaction.budgetId,
          currency: newTransaction.currency,
        }),
      });
      if (res.ok) {
        setNewTransaction({
          amount: "",
          description: "",
          category: "",
          type: "expense",
          budgetId: null,
          currency: "CAD",
        });
        setShowAddForm(false);
        revalidator.revalidate();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    revalidator.revalidate();
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
          date: new Date(editForm.date + "T00:00:00").toISOString(),
          budgetId: editForm.budgetId,
          currency: editForm.currency,
        }),
      });
      if (res.ok) {
        handleCancelEdit();
        revalidator.revalidate();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter banner */}
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

      {/* Add Transaction */}
      {showAddForm ? (
        <form
          onSubmit={handleAddTransaction}
          className="rounded-lg border bg-card p-4 space-y-3"
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setNewTransaction((prev) => ({ ...prev, type: "expense" }))
              }
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                newTransaction.type === "expense"
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() =>
                setNewTransaction((prev) => ({
                  ...prev,
                  type: "income",
                  budgetId: null,
                }))
              }
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                newTransaction.type === "income"
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              Income
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              step="0.01"
              placeholder="Amount"
              value={newTransaction.amount}
              onChange={(e) =>
                setNewTransaction((prev) => ({
                  ...prev,
                  amount: e.target.value,
                }))
              }
              className="col-span-2 rounded-md border border-input bg-background px-3 py-2"
              required
            />
            <CurrencySelect
              value={newTransaction.currency}
              onChange={(v) =>
                setNewTransaction((prev) => ({ ...prev, currency: v as CurrencyCode }))
              }
            />
          </div>

          <input
            type="text"
            placeholder="Description"
            value={newTransaction.description}
            onChange={(e) =>
              setNewTransaction((prev) => ({
                ...prev,
                description: e.target.value,
              }))
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          />

          <input
            type="text"
            placeholder="Category"
            value={newTransaction.category}
            onChange={(e) =>
              setNewTransaction((prev) => ({
                ...prev,
                category: e.target.value,
              }))
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          />

          {newTransaction.type === "expense" && (
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Budget (optional)
              </label>
              <BudgetSelect
                value={newTransaction.budgetId}
                onChange={(budgetId) =>
                  setNewTransaction((prev) => ({ ...prev, budgetId }))
                }
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="flex-1 rounded-md border border-input px-3 py-2 text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !newTransaction.amount}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-muted-foreground hover:border-muted-foreground hover:text-foreground"
        >
          <Plus className="h-5 w-5" />
          Add Transaction
        </button>
      )}

      {/* Transaction List */}
      {allTransactions.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          description="Add your first transaction to start tracking."
        />
      ) : (
        <div className="divide-y divide-border rounded-lg border bg-card">
          {allTransactions.map((transaction) => (
            <div key={transaction.id}>
              {editingId === transaction.id ? (
                <form onSubmit={handleSaveEdit} className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditForm((prev) => ({ ...prev, type: "expense" }))
                      }
                      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                        editForm.type === "expense"
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      Expense
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditForm((prev) => ({
                          ...prev,
                          type: "income",
                          budgetId: null,
                        }))
                      }
                      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                        editForm.type === "income"
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      Income
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.amount}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          amount: e.target.value,
                        }))
                      }
                      className="col-span-2 rounded-md border border-input bg-background px-3 py-2"
                      required
                    />
                    <CurrencySelect
                      value={editForm.currency}
                      onChange={(v) =>
                        setEditForm((prev) => ({ ...prev, currency: v as CurrencyCode }))
                      }
                    />
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          date: e.target.value,
                        }))
                      }
                      className="rounded-md border border-input bg-background px-3 py-2"
                      required
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="Description"
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                  />

                  <input
                    type="text"
                    placeholder="Category"
                    value={editForm.category}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        category: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                    required
                  />

                  {editForm.type === "expense" && (
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">
                        Budget (optional)
                      </label>
                      <BudgetSelect
                        value={editForm.budgetId}
                        onChange={(budgetId) =>
                          setEditForm((prev) => ({ ...prev, budgetId }))
                        }
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="flex-1 rounded-md border border-input px-3 py-2 text-muted-foreground hover:bg-accent"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !editForm.amount}
                      className="flex-1 rounded-md bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isSubmitting ? "Saving..." : "Save"}
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(
                        expandedId === transaction.id ? null : transaction.id
                      )
                    }
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div
                        className={`shrink-0 rounded-full p-2 ${
                          transaction.type === "income"
                            ? "bg-green-500/10"
                            : "bg-red-500/10"
                        }`}
                      >
                        {transaction.type === "income" ? (
                          <ArrowUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <ArrowDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-medium truncate">
                          {transaction.description || transaction.category}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {transaction.category} &bull;{" "}
                          {formatDate(transaction.date)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`font-semibold whitespace-nowrap ${
                          transaction.type === "income"
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {transaction.type === "income" ? "+" : "-"}
                        {formatCents(transaction.amount, transaction.currency)}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          expandedId === transaction.id ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {expandedId === transaction.id && (
                    <div className="px-4 pb-3 pt-1 bg-accent/30 border-t border-border/50">
                      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                        <div>
                          <p className="text-muted-foreground text-xs">
                            Category
                          </p>
                          <p className="font-medium">{transaction.category}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Date</p>
                          <p className="font-medium">
                            {formatDate(transaction.date)}
                          </p>
                        </div>
                        {transaction.description && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground text-xs">
                              Description
                            </p>
                            <p className="font-medium">
                              {transaction.description}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStartEdit(transaction)}
                          className="flex-1 flex items-center justify-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(transaction.id)}
                          className="flex-1 flex items-center justify-center gap-2 rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
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
