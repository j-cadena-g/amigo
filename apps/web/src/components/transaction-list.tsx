"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { Loader2, Plus, Trash2, ArrowDown, ArrowUp } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Loading } from "@/components/loading";
import { addTransaction, deleteTransaction } from "@/actions/transactions";
import { client } from "@/lib/api";

// Transaction type for RPC responses (dates are serialized as strings)
interface TransactionDTO {
  id: string;
  householdId: string;
  userId: string;
  amount: string;
  category: string;
  description: string | null;
  type: "income" | "expense";
  date: string;
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

export function TransactionList() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    amount: "",
    description: "",
    category: "",
    type: "expense" as "income" | "expense",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      });

      setNewTransaction({
        amount: "",
        description: "",
        category: "",
        type: "expense",
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
                setNewTransaction((prev) => ({ ...prev, type: "income" }))
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

          <input
            type="number"
            step="0.01"
            placeholder="Amount"
            value={newTransaction.amount}
            onChange={(e) =>
              setNewTransaction((prev) => ({ ...prev, amount: e.target.value }))
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2"
            required
          />

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
            <div
              key={transaction.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`rounded-full p-2 ${
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
                <div>
                  <p className="font-medium">
                    {transaction.description || transaction.category}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {transaction.category} • {formatDate(transaction.date)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`font-semibold ${
                    transaction.type === "income"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {transaction.type === "income" ? "+" : "-"}
                  {formatCurrency(transaction.amount)}
                </span>
                <button
                  onClick={() => handleDelete(transaction.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete transaction"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
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
