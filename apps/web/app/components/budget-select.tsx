import { useState, useEffect } from "react";
import { formatCents } from "@/app/lib/currency";
import { NativeSelect } from "@/app/components/financial/form-controls";
import type { BudgetPeriod, CurrencyCode } from "@amigo/db";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";

interface Budget {
  id: string;
  name: string;
  limitAmount: number;
  currency: CurrencyCode;
  period: string;
  isShared: boolean;
}

interface BudgetSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  "aria-label"?: string;
}

export function BudgetSelect({
  value,
  onChange,
  id,
  "aria-label": ariaLabel,
}: BudgetSelectProps) {
  const t = useT();
  const locale = useLocale();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const periodLabel = (period: string) =>
    (t.common.periods[period as BudgetPeriod] ?? period).toLocaleLowerCase();

  useEffect(() => {
    fetch("/api/budgets")
      .then((r) => r.json())
      .then((data) => setBudgets(data as Budget[]))
      .catch(() => {});
  }, []);

  const shared = budgets.filter((b) => b.isShared);
  const personal = budgets.filter((b) => !b.isShared);

  return (
    <NativeSelect
      id={id}
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t.transactions.noBudget}</option>
      {shared.length > 0 && (
        <optgroup label={t.transactions.sharedBudgets}>
          {shared.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({formatCents(b.limitAmount, b.currency, locale, { compact: true })}/{periodLabel(b.period)})
            </option>
          ))}
        </optgroup>
      )}
      {personal.length > 0 && (
        <optgroup label={t.transactions.personalBudgets}>
          {personal.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({formatCents(b.limitAmount, b.currency, locale, { compact: true })}/{periodLabel(b.period)})
            </option>
          ))}
        </optgroup>
      )}
    </NativeSelect>
  );
}
