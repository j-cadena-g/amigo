import {
  useId,
  type Dispatch,
  type ReactNode,
  type FormEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { SectionLink } from "@/app/components/ledger";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { Button } from "@/app/components/ui/button";
import { DeleteButton } from "@/app/components/financial/form-controls";
import { formatCents, formatSignedCents } from "@/app/lib/currency";
import {
  formatLedgerDate,
  formatTransactionDate,
  ledgerDateColumnWidth,
} from "@/app/lib/format-dates";
import { cn } from "@/app/lib/utils";
import { EditTransactionForm, type TransactionFormState } from "./transaction-form";
import { useLocale } from "@/app/lib/use-locale";
import { useT, type Messages } from "@/app/i18n";

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
  accountId: string | null;
  createdAt: number;
  exchangeRateToHome: number | null;
  chargedAmount: number | null;
  chargedCurrency: CurrencyCode | null;
}

/** What a row needs to name the account it is tagged to. */
export interface TransactionAccount {
  id: string;
  name: string;
  type: string;
  archived?: boolean;
}

/** The transactions list narrowed to one account, keeping an active type filter. */
function accountHref(accountId: string, typeFilter?: "income" | "expense" | null) {
  const params = new URLSearchParams({ account: accountId });
  if (typeFilter) params.set("type", typeFilter);
  return `/financial?${params}`;
}

/**
 * The recorded charge, and when it is in home currency, how far it landed
 * from the market-rate snapshot taken when the row was saved (fees and the
 * card's own rate).
 */
function chargeDetail(
  transaction: TransactionDTO,
  homeCurrency: CurrencyCode,
  locale: string,
  t: Messages["transactions"]
): { charged: string; versusMarket: ReactNode } | null {
  const { chargedAmount, chargedCurrency, exchangeRateToHome } = transaction;
  if (chargedAmount == null || !chargedCurrency) return null;
  const charged = formatCents(chargedAmount, chargedCurrency, locale);
  if (chargedCurrency !== homeCurrency || exchangeRateToHome == null) {
    return { charged, versusMarket: null };
  }
  const difference = chargedAmount - Math.round(transaction.amount * exchangeRateToHome);
  if (difference === 0) return { charged, versusMarket: null };
  const formatted = (
    <span className="font-mono font-medium">
      {formatCents(Math.abs(difference), homeCurrency, locale)}
    </span>
  );
  return {
    charged,
    versusMarket: difference > 0 ? t.overMarket(formatted) : t.underMarket(formatted),
  };
}

interface TransactionRowProps {
  transaction: TransactionDTO;
  /** The account it is tagged to, when known; deleted or unknown ones show nothing. */
  account?: TransactionAccount;
  /** Active type filter, kept when linking to the account's transactions. */
  typeFilter?: "income" | "expense" | null;
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
  account,
  typeFilter,
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
  const t = useT();
  const locale = useLocale();
  const detailsId = useId();

  if (isEditing) {
    return (
      <li>
        <EditTransactionForm
          form={editForm}
          homeCurrency={homeCurrency}
          isSubmitting={isSubmitting}
          lastExpenseBudgetIdRef={lastEditExpenseBudgetIdRef}
          onChange={onEditFormChange}
          onCancel={onCancelEdit}
          onSubmit={onSaveEdit}
          recordId={transaction.id}
          accountLabel={account?.name}
        />
      </li>
    );
  }

  const isIncome = transaction.type === "income";
  const charge = chargeDetail(transaction, homeCurrency, locale, t.transactions);
  const meta = [
    transaction.description ? transaction.category : null,
    account?.name,
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
        <span
          className="shrink-0 whitespace-nowrap font-mono text-sm text-muted-foreground"
          style={{ width: ledgerDateColumnWidth(locale) }}
        >
          {formatLedgerDate(transaction.date, locale)}
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
            locale,
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
            <dt className="text-muted-foreground">{t.common.date}</dt>
            <dd>{formatTransactionDate(transaction.date, locale)}</dd>
            <dt className="text-muted-foreground">{t.common.category}</dt>
            <dd>{transaction.category}</dd>
            {account && (
              <>
                <dt className="text-muted-foreground">{t.transactions.account}</dt>
                <dd>
                  {/* Linked here rather than in the row's meta line: that sits inside a button. */}
                  <SectionLink to={accountHref(account.id, typeFilter)}>{account.name}</SectionLink>
                </dd>
              </>
            )}
            {charge && (
              <>
                <dt className="text-muted-foreground">
                  {t.transactions.charged(transaction.type)}
                </dt>
                <dd>
                  <span className="font-mono font-medium">{charge.charged}</span>
                  {charge.versusMarket && (
                    <span className="text-muted-foreground"> · {charge.versusMarket}</span>
                  )}
                </dd>
              </>
            )}
            {transaction.description && (
              <>
                <dt className="text-muted-foreground">{t.common.description}</dt>
                <dd className="wrap-break-word">{transaction.description}</dd>
              </>
            )}
          </dl>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onStartEdit}>
              <Pencil />
              {t.common.edit}
            </Button>
            <DeleteButton size="sm" onClick={onDelete}>
              <Trash2 />
              {t.common.delete}
            </DeleteButton>
          </div>
        </div>
      )}
    </li>
  );
}
