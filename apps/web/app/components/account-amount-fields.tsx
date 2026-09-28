import { useId } from "react";
import type { CurrencyCode } from "@amigo/db";
import { AmountInput } from "@/app/components/amount-input";
import { CurrencySelect } from "@/app/components/currency-select";
import { useT } from "@/app/i18n";

interface AccountAmountFieldsProps {
  type: string;
  currency: CurrencyCode;
  onCurrencyChange: (currency: CurrencyCode) => void;
  /** Balance, or the amount owed for a credit card or loan. */
  amount: string;
  onAmountChange: (amount: string) => void;
  creditLimit: string;
  onCreditLimitChange: (creditLimit: string) => void;
  originalAmount: string;
  onOriginalAmountChange: (originalAmount: string) => void;
}

/**
 * Amount and currency for an account form. A credit card or loan takes the
 * amount owed plus an optional limit or original amount; other types a balance.
 */
export function AccountAmountFields({
  type,
  currency,
  onCurrencyChange,
  amount,
  onAmountChange,
  creditLimit,
  onCreditLimitChange,
  originalAmount,
  onOriginalAmountChange,
}: AccountAmountFieldsProps) {
  const t = useT();
  const amountId = useId();
  const currencyId = useId();
  const extraId = useId();
  const isCard = type === "CREDIT";
  const isLoan = type === "LOAN";

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <label className="text-sm font-semibold" htmlFor={amountId}>
          {isCard || isLoan ? t.accounts.amountOwed : t.common.balance}
        </label>
        <AmountInput
          id={amountId}
          currency={currency}
          allowNegative
          value={amount}
          onValueChange={onAmountChange}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-semibold" htmlFor={currencyId}>
          {t.common.currency}
        </label>
        <CurrencySelect
          id={currencyId}
          value={currency}
          onChange={(v) => onCurrencyChange(v as CurrencyCode)}
        />
      </div>
      {isCard || isLoan ? (
        <div className="space-y-1.5">
          <label className="text-sm font-semibold" htmlFor={extraId}>
            {isCard ? t.accounts.creditLimit : t.accounts.originalAmount}
          </label>
          <AmountInput
            id={extraId}
            currency={currency}
            positive
            value={isCard ? creditLimit : originalAmount}
            onValueChange={isCard ? onCreditLimitChange : onOriginalAmountChange}
          />
        </div>
      ) : null}
    </div>
  );
}
