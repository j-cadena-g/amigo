"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { Loader2, Plus, Trash2, ArrowDown, ArrowUp, Pencil, Target, ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Loading } from "@/components/loading";
import { BudgetSelect } from "@/components/budget-select";
import { CurrencySelect } from "@/components/currency-select";
import { TransferredFromIndicator } from "@/components/transferred-from-indicator";
import { addTransaction, deleteTransaction, updateTransaction } from "@/actions/transactions";
import { client } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import type { CurrencyCode } from "@amigo/db/schema";

// Transaction type for RPC responses (dates are serialized as strings)
interface TransactionDTO {
  id: string;
  householdId: string;
  userId: string | null;
  createdByDisplayName: string;
  isDeletedUser: boolean;
  transferredFromUserId: string | null;
  transferredFromDisplayName: string | null;
  wasTransferred: boolean;
  amount: string;
  currency: CurrencyCode;
  exchangeRateToHome: string | null;
  category: string;
  description: string | null;
  type: "income" | "expense";
  date: string;
  budgetId: string | null;
  budgetName?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface TransactionsResponse {
  data: TransactionDTO[];
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

async function fetchTransactions(
  page: number,
  category?: string
): Promise<TransactionsResponse> {
  const query: { page: string; limit: string; category?: string } = {
    page: String(page),
    limit: "10",
  };
  if (category) {
    query.category = category;
  }

  const response = await client.api.transactions.$get({ query });

  if (!response.ok) {
    throw new Error("Failed to fetch transactions");
  }

  return response.json();
}

function formatDate(date: Date | string): string {
  let d: Date;
  if (typeof date === "string") {
    // Extract just the date portion and parse as local time
    // This handles both "2026-01-01" and "2026-02-01T00:00:00.000Z" formats
    const dateOnly = date.split("T")[0];
    d = new Date(dateOnly + "T00:00:00");
  } else {
    // For Date objects, use UTC components to avoid timezone shift
    const dateOnly = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    d = new Date(dateOnly + "T00:00:00");
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface TransactionListProps {
  currentUserId: string;
}

export function TransactionList({ currentUserId }: TransactionListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    amount: "",
    description: "",
    category: "",
    type: "expense" as "income" | "expense",
    budgetId: null as string | null,
    currency: "CAD" as CurrencyCode,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    amount: "",
    description: "",
    category: "",
    type: "expense" as "income" | "expense",
    date: "",
    budgetId: null as string | null,
    currency: "CAD" as CurrencyCode,
  });

  // Intersection observer for infinite scroll
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["transactions"],
    queryFn: ({ pageParam }) => fetchTransactions(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
  });

  // Auto-fetch when scroll sentinel comes into view
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const transactions = data?.pages.flatMap((page) => page.data) ?? [];

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await addTransaction({
        amount: parseFloat(newTransaction.amount),
        description: newTransaction.description,
        category: newTransaction.category || "Uncategorized",
        type: newTransaction.type,
        date: new Date(),
        budgetId: newTransaction.budgetId,
        currency: newTransaction.currency,
      });

      setNewTransaction({
        amount: "",
        description: "",
        category: "",
        type: "expense",
        budgetId: null,
        currency: "CAD",
      });
      setShowAddForm(false);
      refetch();
    } catch (error) {
      console.error("Failed to add transaction:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
      refetch();
    } catch (error) {
      console.error("Failed to delete transaction:", error);
    }
  };

  const handleStartEdit = (transaction: TransactionDTO) => {
    const dateOnly = transaction.date.split("T")[0] ?? "";
    setEditingId(transaction.id);
    setEditForm({
      amount: transaction.amount,
      description: transaction.description || "",
      category: transaction.category,
      type: transaction.type,
      date: dateOnly,
      budgetId: transaction.budgetId,
      currency: transaction.currency,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({
      amount: "",
      description: "",
      category: "",
      type: "expense",
      date: "",
      budgetId: null,
      currency: "CAD",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    setIsSubmitting(true);
    try {
      await updateTransaction({
        id: editingId,
        amount: parseFloat(editForm.amount),
        description: editForm.description || null,
        category: editForm.category,
        type: editForm.type,
        date: new Date(editForm.date + "T00:00:00"),
        budgetId: editForm.budgetId,
        currency: editForm.currency,
      });
      handleCancelEdit();
      refetch();
    } catch (error) {
      console.error("Failed to update transaction:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <Loading />;
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        Failed to load transactions. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Transaction Button/Form */}
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
                setNewTransaction((prev) => ({ ...prev, type: "income", budgetId: null }))
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
                setNewTransaction((prev) => ({ ...prev, amount: e.target.value }))
              }
              className="col-span-2 rounded-md border border-input bg-background px-3 py-2"
              required
            />
            <CurrencySelect
              value={newTransaction.currency}
              onChange={(currency) =>
                setNewTransaction((prev) => ({ ...prev, currency }))
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
              <label className="text-sm text-muted-foreground mb-1 block">Budget (optional)</label>
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
      {transactions.length === 0 ? (
        <EmptyState message="No transactions yet." />
      ) : (
        <div className="divide-y divide-border rounded-lg border bg-card">
          {transactions.map((transaction) => (
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
                        setEditForm((prev) => ({ ...prev, type: "income", budgetId: null }))
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
                      placeholder="Amount"
                      value={editForm.amount}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, amount: e.target.value }))
                      }
                      className="col-span-2 rounded-md border border-input bg-background px-3 py-2"
                      required
                    />
                    <CurrencySelect
                      value={editForm.currency}
                      onChange={(currency) =>
                        setEditForm((prev) => ({ ...prev, currency }))
                      }
                    />
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, date: e.target.value }))
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
                      <label className="text-sm text-muted-foreground mb-1 block">Budget (optional)</label>
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
                  {/* Main row - tappable */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === transaction.id ? null : transaction.id)}
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
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">
                            {transaction.description || transaction.category}
                          </p>
                          {transaction.budgetId && (
                            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded">
                              <Target className="h-3 w-3" />
                              <span className="hidden sm:inline">
                                {transaction.budgetName || "Budget"}
                              </span>
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {transaction.category} • {formatDate(transaction.date)}
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
                        {formatCurrency(transaction.amount, transaction.currency)}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          expandedId === transaction.id ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {/* Expanded details */}
                  {expandedId === transaction.id && (
                    <div className="px-4 pb-3 pt-1 bg-accent/30 border-t border-border/50">
                      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                        <div>
                          <p className="text-muted-foreground text-xs">Category</p>
                          <p className="font-medium">{transaction.category}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Date</p>
                          <p className="font-medium">{formatDate(transaction.date)}</p>
                        </div>
                        {transaction.description && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground text-xs">Description</p>
                            <p className="font-medium">{transaction.description}</p>
                          </div>
                        )}
                        {transaction.budgetId && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground text-xs">Budget</p>
                            <p className="font-medium">{transaction.budgetName || "Budget"}</p>
                          </div>
                        )}
                        {transaction.currency !== "CAD" && (
                          <div>
                            <p className="text-muted-foreground text-xs">Currency</p>
                            <p className="font-medium">{transaction.currency}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-muted-foreground text-xs">Created by</p>
                          <p className={`font-medium ${transaction.isDeletedUser ? "text-muted-foreground italic" : ""}`}>
                            {transaction.createdByDisplayName}
                            {transaction.isDeletedUser && " (removed)"}
                          </p>
                        </div>
                        {transaction.wasTransferred && transaction.transferredFromDisplayName && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground text-xs mb-1">Transferred</p>
                            <TransferredFromIndicator
                              originalOwnerName={transaction.transferredFromDisplayName}
                              recordId={transaction.id}
                              tableName="transactions"
                              show={transaction.userId === currentUserId}
                            />
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
      <div ref={loadMoreRef} className="flex justify-center py-4">
        {isFetchingNextPage && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
        {!hasNextPage && transactions.length > 0 && (
          <p className="text-sm text-muted-foreground">No more transactions</p>
        )}
      </div>
    </div>
  );
}
