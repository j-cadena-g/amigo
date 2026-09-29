import {
  useEffect,
  useId,
  type Dispatch,
  type FormEvent,
  type MutableRefObject,
  type Ref,
  type SetStateAction,
} from "react";
import type { CurrencyCode } from "@amigo/db";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { AmountInput } from "@/app/components/amount-input";
import { AccountSelect } from "@/app/components/account-select";
import { BudgetSelect } from "@/app/components/budget-select";
import { CategorySelect } from "@/app/components/financial/category-select";
import { useFinancialCategories } from "@/app/components/financial/use-financial-categories";
import { CurrencySelect } from "@/app/components/currency-select";
import { SectionLink } from "@/app/components/ledger";
import { TypeToggle } from "@/app/components/type-toggle";
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";
import { isPositiveAmount, parseAmount } from "@/app/lib/decimal-input";
import { useT } from "@/app/i18n";

export interface TransactionFormState {
  amount: string;
  description: string;
  categoryId: string;
  type: "income" | "expense";
  date: string;
  budgetId: string | null;
  /** Tags the transaction to an account; never changes the account's balance. */
  accountId: string | null;
  currency: CurrencyCode;
  /** What the card actually charged, as typed; blank uses the market rate. */
  chargedAmount: string;
  /** Currency of a recorded charge; null until one is recorded (then home). */
  chargedCurrency: CurrencyCode | null;
}

const AMOUNT_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_5.75rem] gap-3 sm:grid-cols-[minmax(0,1fr)_5.75rem_minmax(0,11rem)]";

function chargeCurrency(form: TransactionFormState, homeCurrency: CurrencyCode) {
  return form.chargedCurrency ?? homeCurrency;
}

/**
 * The charge row shows for foreign-currency amounts, and on a home-currency
 * row that already records a charge in another currency. Plain home-currency
 * rows (almost all of them) don't get it.
 */
function showsCharge(form: TransactionFormState, homeCurrency: CurrencyCode) {
  return (
    form.currency !== homeCurrency ||
    (form.chargedCurrency !== null && form.chargedCurrency !== form.currency)
  );
}

/**
 * API fields for the charge: integer cents, or null to use the market rate.
 * The form sends the charge exactly as shown, so editing the amount keeps it:
 * the statement figure doesn't change when a receipt typo is fixed, and the
 * field sits right under the amount to change or clear alongside it.
 */
export function chargePayload(
  form: TransactionFormState,
  homeCurrency: CurrencyCode
): { chargedAmount: number | null; chargedCurrency?: CurrencyCode } {
  const currency = chargeCurrency(form, homeCurrency);
  const amount =
    showsCharge(form, homeCurrency) && currency !== form.currency
      ? parseAmount(form.chargedAmount)
      : null;
  if (amount === null || amount <= 0) return { chargedAmount: null };
  return { chargedAmount: Math.round(amount * 100), chargedCurrency: currency };
}

interface TransactionFieldsProps {
  form: TransactionFormState;
  homeCurrency: CurrencyCode;
  lastExpenseBudgetIdRef: MutableRefObject<string | null>;
  onChange: Dispatch<SetStateAction<TransactionFormState>>;
  onCategoryChange: (categoryId: string) => void;
  onBudgetChange: (budgetId: string | null) => void;
  /** Name for a linked account that is no longer in the live list (archived). */
  accountLabel?: string;
  amountRef?: Ref<HTMLInputElement>;
}

function TransactionFields({
  form,
  homeCurrency,
  lastExpenseBudgetIdRef,
  onChange,
  onCategoryChange,
  onBudgetChange,
  accountLabel,
  amountRef,
}: TransactionFieldsProps) {
  const t = useT();
  const amountId = useId();
  const currencyId = useId();
  const dateId = useId();
  const chargedId = useId();
  const chargedHintId = useId();
  const descriptionId = useId();
  const categoryFieldId = useId();
  const budgetFieldId = useId();
  const accountFieldId = useId();
  const { categories } = useFinancialCategories();

  const selectType = (type: "income" | "expense") =>
    onChange((prev) => {
      if (type === prev.type) return prev;
      return {
        ...prev,
        type,
        categoryId: "",
        budgetId:
          type === "income"
            ? null
            : prev.type === "income"
              ? lastExpenseBudgetIdRef.current
              : prev.budgetId,
      };
    });

  return (
    <>
      <TypeToggle
        label={t.transactions.typeLabel}
        options={[
          { value: "expense", label: t.common.expense },
          { value: "income", label: t.common.income },
        ] as const}
        value={form.type}
        onChange={selectType}
      />

      <div className={AMOUNT_ROW_GRID}>
        <div className="space-y-1.5">
          <label htmlFor={amountId} className="text-sm font-semibold">
            {t.common.amount}
          </label>
          <AmountInput
            id={amountId}
            ref={amountRef}
            autoFocus
            currency={form.currency}
            positive
            value={form.amount}
            onValueChange={(amount) => onChange((prev) => ({ ...prev, amount }))}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={currencyId} className="text-sm font-semibold">
            {t.common.currency}
          </label>
          <CurrencySelect
            id={currencyId}
            compact
            value={form.currency}
            onChange={(v) =>
              onChange((prev) =>
                prev.chargedCurrency === v
                  ? // A charge can't be in the amount's own currency: start it over in home.
                    { ...prev, currency: v, chargedCurrency: null, chargedAmount: "" }
                  : { ...prev, currency: v as CurrencyCode }
              )
            }
          />
        </div>
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <label htmlFor={dateId} className="text-sm font-semibold">
            {t.common.date}
          </label>
          <Input
            id={dateId}
            type="date"
            value={form.date}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                date: e.target.value,
              }))
            }
            required
          />
        </div>
      </div>

      {showsCharge(form, homeCurrency) && (
        <div className="space-y-1.5">
          <label htmlFor={chargedId} className="text-sm font-semibold">
            {t.transactions.chargedLabel(form.type)}
          </label>
          {/* Same columns as the row above: amount under Amount, currency under Currency. */}
          <div className={AMOUNT_ROW_GRID}>
            <AmountInput
              id={chargedId}
              currency={chargeCurrency(form, homeCurrency)}
              positive
              value={form.chargedAmount}
              onValueChange={(chargedAmount) =>
                onChange((prev) => ({ ...prev, chargedAmount }))
              }
              aria-describedby={chargedHintId}
            />
            <CurrencySelect
              compact
              aria-label={t.transactions.chargedCurrencyLabel(form.type)}
              value={chargeCurrency(form, homeCurrency)}
              exclude={[form.currency]}
              onChange={(v) =>
                onChange((prev) => ({ ...prev, chargedCurrency: v as CurrencyCode }))
              }
            />
          </div>
          <p id={chargedHintId} className="text-xs text-muted-foreground">
            {t.transactions.chargedHint(form.type, form.currency !== homeCurrency)}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={descriptionId} className="text-sm font-semibold">
          {t.common.descriptionOptional}
        </label>
        <Input
          id={descriptionId}
          type="text"
          value={form.description}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              description: e.target.value,
            }))
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={categoryFieldId} className="text-sm font-semibold">
            {t.common.category}
          </label>
          <CategorySelect
            id={categoryFieldId}
            value={form.categoryId}
            onChange={onCategoryChange}
            type={form.type}
            categories={categories}
          />
        </div>

        {form.type === "expense" && (
          <div className="space-y-1.5">
            <label htmlFor={budgetFieldId} className="text-sm font-semibold">
              {t.transactions.budgetOptional}
            </label>
            <BudgetSelect
              id={budgetFieldId}
              value={form.budgetId}
              onChange={onBudgetChange}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor={accountFieldId} className="text-sm font-semibold">
            {t.transactions.account}
          </label>
          <AccountSelect
            id={accountFieldId}
            value={form.accountId}
            onChange={(accountId) => onChange((prev) => ({ ...prev, accountId }))}
            homeCurrency={homeCurrency}
            fallbackLabel={accountLabel}
          />
        </div>
      </div>
    </>
  );
}

function FormActions({
  onCancel,
  submitDisabled,
  submitLabel,
}: {
  onCancel: () => void;
  submitDisabled: boolean;
  submitLabel: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel}>
        {t.common.cancel}
      </Button>
      <Button type="submit" disabled={submitDisabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

interface AddTransactionFormProps {
  form: TransactionFormState;
  homeCurrency: CurrencyCode;
  isSubmitting: boolean;
  formError: string | null;
  allowBudgetSuggest: boolean;
  lastExpenseBudgetIdRef: MutableRefObject<string | null>;
  onChange: Dispatch<SetStateAction<TransactionFormState>>;
  onAllowBudgetSuggestChange: (allow: boolean) => void;
  onCancel: () => void;
  onSubmit: (e: FormEvent) => void;
  amountRef?: Ref<HTMLInputElement>;
  /** Name of the selected account, shown until the account list loads. */
  accountLabel?: string;
}

export function AddTransactionForm({
  form,
  homeCurrency,
  isSubmitting,
  formError,
  allowBudgetSuggest,
  lastExpenseBudgetIdRef,
  onChange,
  onAllowBudgetSuggestChange,
  onCancel,
  onSubmit,
  amountRef,
  accountLabel,
}: AddTransactionFormProps) {
  const t = useT();
  useEffect(() => {
    if (form.type !== "expense" || !allowBudgetSuggest || !form.categoryId) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/budgets/match-category?${new URLSearchParams({
              categoryId: form.categoryId,
            })}`,
            { signal: ac.signal }
          );
          if (!res.ok) return;
          const data = (await res.json()) as { budgetId: string | null };
          onChange((p) => ({ ...p, budgetId: data.budgetId ?? null }));
        } catch {
          /* aborted */
        }
      })();
    }, 200);
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [form.categoryId, form.type, allowBudgetSuggest, onChange]);

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border p-4">
      <TransactionFields
        form={form}
        homeCurrency={homeCurrency}
        lastExpenseBudgetIdRef={lastExpenseBudgetIdRef}
        onChange={onChange}
        onCategoryChange={(categoryId) => {
          onAllowBudgetSuggestChange(true);
          onChange((prev) => ({ ...prev, categoryId }));
        }}
        onBudgetChange={(budgetId) => {
          onAllowBudgetSuggestChange(false);
          onChange((prev) => ({ ...prev, budgetId }));
        }}
        amountRef={amountRef}
        accountLabel={accountLabel}
      />

      {formError && (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        {t.transactions.needSchedule(
          <SectionLink to="/financial/recurring">{t.transactions.setUpRecurring}</SectionLink>
        )}
      </p>

      <FormActions
        onCancel={onCancel}
        submitDisabled={
          isSubmitting || !isPositiveAmount(form.amount) || !form.categoryId
        }
        submitLabel={isSubmitting ? t.transactions.adding : t.transactions.add}
      />
    </form>
  );
}

interface EditTransactionFormProps {
  form: TransactionFormState;
  homeCurrency: CurrencyCode;
  isSubmitting: boolean;
  lastExpenseBudgetIdRef: MutableRefObject<string | null>;
  onChange: Dispatch<SetStateAction<TransactionFormState>>;
  onCancel: () => void;
  onSubmit: (e: FormEvent) => void;
  recordId?: string;
  accountLabel?: string;
}

export function EditTransactionForm({
  form,
  homeCurrency,
  isSubmitting,
  lastExpenseBudgetIdRef,
  onChange,
  onCancel,
  onSubmit,
  recordId,
  accountLabel,
}: EditTransactionFormProps) {
  const t = useT();
  return (
    <form onSubmit={onSubmit} className="my-3 space-y-4 rounded-xl border border-border p-4">
      <TransactionFields
        form={form}
        homeCurrency={homeCurrency}
        lastExpenseBudgetIdRef={lastExpenseBudgetIdRef}
        onChange={onChange}
        onCategoryChange={(categoryId) => onChange((prev) => ({ ...prev, categoryId }))}
        onBudgetChange={(budgetId) => onChange((prev) => ({ ...prev, budgetId }))}
        accountLabel={accountLabel}
      />

      {recordId ? (
        <AuditHistoryPanel recordId={recordId} table="transactions" />
      ) : null}

      <FormActions
        onCancel={onCancel}
        submitDisabled={
          isSubmitting || !isPositiveAmount(form.amount) || !form.categoryId
        }
        submitLabel={isSubmitting ? t.common.saving : t.transactions.save}
      />
    </form>
  );
}
