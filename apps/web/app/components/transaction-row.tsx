import {
  useId,
  type Dispatch,
  type FormEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { Button } from "@/app/components/ui/button";
import { DeleteButton } from "@/app/components/financial/form-controls";
import { formatSignedCents } from "@/app/lib/currency";
import { formatLedgerDate, formatTransactionDate } from "@/app/lib/format-dates";
import { cn } from "@/app/lib/utils";
import { EditTransactionForm, type TransactionFormState } from "./transaction-form";

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
  homeCurrency: CurrencyCode;
  expanded: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  lastEditExpenseBudgetIdRef: MutableRefObject<string | null>;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (e: FormEvent) => void;
  onDelete: () => void;
  editForm: TransactionFormState;
  onEditFormChange: Dispatch<SetStateAction<TransactionFormState>>;
}

export function TransactionRow({
  transaction,
  homeCurrency,
  expanded,
  isEditing,
  isSubmitting,
  lastEditExpenseBudgetIdRef,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  editForm,
  onEditFormChange,
}: TransactionRowProps) {
  const detailsId = useId();

  if (isEditing) {
    return (
      <li>
        <EditTransactionForm
          form={editForm}
          isSubmitting={isSubmitting}
          lastExpenseBudgetIdRef={lastEditExpenseBudgetIdRef}
          onChange={onEditFormChange}
          onCancel={onCancelEdit}
          onSubmit={onSaveEdit}
          recordId={transaction.id}
        />
      </li>
    );
  }

  const isIncome = transaction.type === "income";
  const meta = [
    transaction.description ? transaction.category : null,
    transaction.currency !== homeCurrency ? transaction.currency : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        aria-controls={expanded ? detailsId : undefined}
        className="group flex w-full items-baseline gap-3 py-2.5 text-left"
      >
        <span className="w-14 shrink-0 font-mono text-sm text-muted-foreground">
          {formatLedgerDate(transaction.date)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold group-hover:underline">
            {transaction.description || transaction.category}
          </span>
          {meta && (
            <span className="block truncate text-sm text-muted-foreground">{meta}</span>
          )}
        </span>
        <span
          className={cn("shrink-0 font-mono font-medium", isIncome && "text-success")}
        >
          {formatSignedCents(
            isIncome ? transaction.amount : -transaction.amount,
            transaction.currency,
            { showPlus: true }
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 self-center text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div id={detailsId} className="pb-3 pl-17">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Date</dt>
            <dd>{formatTransactionDate(transaction.date)}</dd>
            <dt className="text-muted-foreground">Category</dt>
            <dd>{transaction.category}</dd>
            {transaction.description && (
              <>
                <dt className="text-muted-foreground">Description</dt>
                <dd className="wrap-break-word">{transaction.description}</dd>
              </>
            )}
          </dl>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onStartEdit}>
              <Pencil />
              Edit
            </Button>
            <DeleteButton size="sm" onClick={onDelete}>
              <Trash2 />
              Delete
            </DeleteButton>
          </div>
        </div>
      )}
    </li>
  );
}
