import type { Dispatch, FormEvent, MutableRefObject, SetStateAction } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Pencil,
  Trash2,
} from "lucide-react";
import { formatCents } from "@/app/lib/currency";
import { formatRelativeDate, formatTransactionDate } from "@/app/lib/format-dates";
import type { CurrencyCode } from "@amigo/db";
import { EditTransactionForm } from "./transaction-form";

export interface TransactionDTO {
  id: string;
  userId: string | null;
  amount: number;
  currency: CurrencyCode;
  categoryId: string | null;
  category: string;
  description: string | null;
  type: "income" | "expense";
  date: string;
  budgetId: string | null;
  createdAt: number;
}

interface TransactionRowProps {
  transaction: TransactionDTO;
  todayStr: string;
  expanded: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  homeCurrency: CurrencyCode;
  lastEditExpenseBudgetIdRef: MutableRefObject<string | null>;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (e: FormEvent) => void;
  onDelete: () => void;
  editForm: {
    amount: string;
    description: string;
    categoryId: string;
    type: "income" | "expense";
    date: string;
    budgetId: string | null;
    currency: CurrencyCode;
  };
  onEditFormChange: Dispatch<
    SetStateAction<{
      amount: string;
      description: string;
      categoryId: string;
      type: "income" | "expense";
      date: string;
      budgetId: string | null;
      currency: CurrencyCode;
    }>
  >;
}

export function TransactionRow({
  transaction,
  todayStr,
  expanded,
  isEditing,
  isSubmitting,
  homeCurrency: _homeCurrency,
  lastEditExpenseBudgetIdRef,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  editForm,
  onEditFormChange,
}: TransactionRowProps) {
  if (isEditing) {
    return (
      <EditTransactionForm
        form={editForm}
        isSubmitting={isSubmitting}
        lastExpenseBudgetIdRef={lastEditExpenseBudgetIdRef}
        onChange={onEditFormChange}
        onCancel={onCancelEdit}
        onSubmit={onSaveEdit}
        recordId={transaction.id}
      />
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggleExpand}
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
              {transaction.category} &bull; {formatRelativeDate(transaction.date, todayStr)}
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
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-accent/30 border-t border-border/50">
          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div>
              <p className="text-muted-foreground text-xs">Category</p>
              <p className="font-medium">{transaction.category}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Date</p>
              <p className="font-medium">{formatTransactionDate(transaction.date)}</p>
            </div>
            {transaction.description && (
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs">Description</p>
                <p className="font-medium">{transaction.description}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onStartEdit}
              className="flex-1 flex items-center justify-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex-1 flex items-center justify-center gap-2 rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
