"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Transaction } from "@amigo/db";
import { Loader2, Plus, Trash2, ArrowDown, ArrowUp } from "lucide-react";
import { addTransaction, deleteTransaction } from "@/actions/transactions";

interface TransactionListProps {
  apiUrl: string;
}

interface TransactionsResponse {
  data: Transaction[];
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

async function fetchTransactions(
  apiUrl: string,
  page: number,
  category?: string
): Promise<TransactionsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: "10",
  });
  if (category) {
    params.set("category", category);
  }

  const response = await fetch(`${apiUrl}/api/transactions?${params}`, {
    credentials: "include",
  });

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

export function TransactionList({ apiUrl }: TransactionListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    amount: "",
    description: "",
    category: "",
    type: "expense" as "income" | "expense",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    queryFn: ({ pageParam }) => fetchTransactions(apiUrl, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
  });

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
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
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
          className="rounded-lg border bg-white p-4 space-y-3"
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setNewTransaction((prev) => ({ ...prev, type: "expense" }))
              }
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                newTransaction.type === "expense"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-600"
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
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
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
            className="w-full rounded-md border px-3 py-2"
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
            className="w-full rounded-md border px-3 py-2"
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
            className="w-full rounded-md border px-3 py-2"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="flex-1 rounded-md border px-3 py-2 text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !newTransaction.amount}
              className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-gray-500 hover:border-gray-400 hover:text-gray-600"
        >
          <Plus className="h-5 w-5" />
          Add Transaction
        </button>
      )}

      {/* Transaction List */}
      {transactions.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-center text-gray-500">
          No transactions yet.
        </div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-lg border bg-white">
          {transactions.map((transaction) => (
            <div
              key={transaction.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`rounded-full p-2 ${
                    transaction.type === "income"
                      ? "bg-green-100"
                      : "bg-red-100"
                  }`}
                >
                  {transaction.type === "income" ? (
                    <ArrowUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <ArrowDown className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {transaction.description || transaction.category}
                  </p>
                  <p className="text-sm text-gray-500">
                    {transaction.category} • {formatDate(transaction.date)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`font-semibold ${
                    transaction.type === "income"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {transaction.type === "income" ? "+" : "-"}
                  {formatCurrency(transaction.amount)}
                </span>
                <button
                  onClick={() => handleDelete(transaction.id)}
                  className="text-gray-400 hover:text-red-500"
                  aria-label="Delete transaction"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More Button */}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="flex w-full items-center justify-center gap-2 rounded-lg border bg-white py-3 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {isFetchingNextPage ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            "Load More"
          )}
        </button>
      )}
    </div>
  );
}
