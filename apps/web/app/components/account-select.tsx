import { useState, useEffect } from "react";
import type { CurrencyCode } from "@amigo/db";
import { Button } from "@/app/components/ui/button";
import { NativeSelect } from "@/app/components/financial/form-controls";
import { groupAccountsForSelect, type AccountSelectGroupKey } from "@/app/lib/account-select-groups";
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
  /** Offer only these groups; another chosen account is cleared once the list loads. */
  groups?: readonly AccountSelectGroupKey[];
  /** A saved link that stays listed outside `groups`. */
  keepId?: string | null;
  id?: string;
  "aria-label"?: string;
}

export function AccountSelect({
  value,
  onChange,
  homeCurrency,
  fallbackLabel,
  groups: allowedGroups,
  keepId,
  id,
  "aria-label": ariaLabel,
}: AccountSelectProps) {
  const t = useT();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        // An error body (e.g. rate limited) is a failed load, not a list.
        if (Array.isArray(data)) setAccounts(data as Account[]);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const groups = groupAccountsForSelect(accounts ?? [], allowedGroups, keepId);
  const valueLeftOut =
    value !== null &&
    Boolean(accounts?.some((a) => a.id === value)) &&
    !groups.some((group) => group.accounts.some((a) => a.id === value));
  useEffect(() => {
    if (valueLeftOut) onChange(null);
  }, [valueLeftOut, onChange]);
  const optionLabel = (a: Account) =>
    a.currency !== homeCurrency ? `${a.name} · ${a.currency}` : a.name;
  // Until the list arrives, a chosen account is kept selectable rather than shown blank.
  const showFallback = value !== null && !accounts?.some((a) => a.id === value);

  return (
    <>
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
      {failed && (
        <p className="text-sm text-destructive" role="alert">
          {t.transactions.accountsLoadFailed}{" "}
          <Button
            type="button"
            variant="link"
            onClick={() => setAttempt((n) => n + 1)}
            className="h-auto p-0 align-baseline text-destructive"
          >
            {t.common.tryAgain}
          </Button>
        </p>
      )}
    </>
  );
}
