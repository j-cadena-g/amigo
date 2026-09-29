import { useState, useEffect } from "react";
import type { CurrencyCode } from "@amigo/db";
import { NativeSelect } from "@/app/components/financial/form-controls";
import { groupAccountsForSelect } from "@/app/lib/account-select-groups";
import { useT } from "@/app/i18n";

interface Account {
  id: string;
  name: string;
  type: string;
  currency: CurrencyCode;
}

interface AccountSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  homeCurrency: CurrencyCode;
  /** Name for a `value` missing from the live list (archived); generic when absent. */
  fallbackLabel?: string;
  id?: string;
  "aria-label"?: string;
}

export function AccountSelect({
  value,
  onChange,
  homeCurrency,
  fallbackLabel,
  id,
  "aria-label": ariaLabel,
}: AccountSelectProps) {
  const t = useT();
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        // An error body (e.g. rate limited) leaves the list as-is rather than breaking the select.
        if (!cancelled && Array.isArray(data)) setAccounts(data as Account[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = groupAccountsForSelect(accounts ?? []);
  const optionLabel = (a: Account) =>
    a.currency !== homeCurrency ? `${a.name} · ${a.currency}` : a.name;
  // Until the list arrives, a chosen account is kept selectable rather than shown blank.
  const showFallback = value !== null && !accounts?.some((a) => a.id === value);

  return (
    <NativeSelect
      id={id}
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t.transactions.noAccount}</option>
      {groups.map((group) => (
        <optgroup key={group.key} label={t.accounts[group.key]}>
          {group.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {optionLabel(a)}
            </option>
          ))}
        </optgroup>
      ))}
      {showFallback && (
        <option value={value}>
          {fallbackLabel ?? (accounts ? t.transactions.archivedAccount : "")}
        </option>
      )}
    </NativeSelect>
  );
}
