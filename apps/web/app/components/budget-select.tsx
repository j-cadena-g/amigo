import { useState, useEffect } from "react";
import { formatCents } from "@/app/lib/currency";
import type { CurrencyCode } from "@amigo/db";

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
}

export function BudgetSelect({ value, onChange }: BudgetSelectProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);

  useEffect(() => {
    fetch("/api/budgets")
      .then((r) => r.json())
      .then((data) => setBudgets(data as Budget[]))
      .catch(() => {});
  }, []);

  const shared = budgets.filter((b) => b.isShared);
  const personal = budgets.filter((b) => !b.isShared);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      <option value="">No budget</option>
      {shared.length > 0 && (
        <optgroup label="Shared">
          {shared.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({formatCents(b.limitAmount, b.currency, { compact: true })}/{b.period})
            </option>
          ))}
        </optgroup>
      )}
      {personal.length > 0 && (
        <optgroup label="Personal">
          {personal.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({formatCents(b.limitAmount, b.currency, { compact: true })}/{b.period})
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
