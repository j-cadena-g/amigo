import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { CURRENCY_CODES, type CurrencyCode } from "@amigo/db";
import { toastMutationFailure } from "@/app/lib/api-error";
import { buildTimezoneOptions } from "@/app/lib/timezones";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base disabled:cursor-not-allowed disabled:opacity-50";

interface HouseholdSettingsFormProps {
  name: string;
  homeCurrency: CurrencyCode;
  timezone: string;
  canEdit: boolean;
}

export function HouseholdSettingsForm({
  name,
  homeCurrency,
  timezone,
  canEdit,
}: HouseholdSettingsFormProps) {
  const revalidator = useRevalidator();
  const toast = useToast();
  const confirm = useConfirm();
  const [nameValue, setNameValue] = useState(name);
  const [currencyValue, setCurrencyValue] = useState<CurrencyCode>(homeCurrency);
  const [timezoneValue, setTimezoneValue] = useState(timezone);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (dirtyRef.current) return;
    setNameValue(name);
    setCurrencyValue(homeCurrency);
    setTimezoneValue(timezone);
  }, [name, homeCurrency, timezone]);

  const trimmedName = nameValue.trim();
  const dirty =
    trimmedName !== name ||
    currencyValue !== homeCurrency ||
    timezoneValue !== timezone;
  dirtyRef.current = dirty;
  const canSave = canEdit && dirty && trimmedName.length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;

    if (currencyValue !== homeCurrency) {
      const confirmed = await confirm({
        title: "Change home currency?",
        description:
          "This updates household totals and conversion rates for accounts, debts, assets, transactions, and budgets. Native amounts in each record’s own currency are not changed.",
        confirmText: "Change currency",
      });
      if (!confirmed) return;
    }

    const body: {
      name?: string;
      homeCurrency?: CurrencyCode;
      timezone?: string;
    } = {};
    if (trimmedName !== name) body.name = trimmedName;
    if (currencyValue !== homeCurrency) body.homeCurrency = currencyValue;
    if (timezoneValue !== timezone) body.timezone = timezoneValue;

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        await toastMutationFailure(toast, res, "Save household settings");
        return;
      }
      toast("Household settings saved");
      revalidator.revalidate();
    } catch {
      await toastMutationFailure(toast, null, "Save household settings");
    } finally {
      setSaving(false);
    }
  }

  const timezoneOptions = buildTimezoneOptions(timezoneValue);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      className="space-y-5"
    >
      {!canEdit && (
        <p className="text-sm text-muted-foreground">
          Only the owner or an admin can change these.
        </p>
      )}

      <div>
        <label htmlFor="household-name" className="block text-sm font-semibold">
          Name
        </label>
        <Input
          id="household-name"
          type="text"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          maxLength={80}
          disabled={!canEdit || saving}
          required
          className="mt-1.5"
        />
      </div>

      <div>
        <label
          htmlFor="household-home-currency"
          className="block text-sm font-semibold"
        >
          Home currency
        </label>
        <p
          id="household-home-currency-hint"
          className="text-sm text-muted-foreground"
        >
          Used for household totals. Changing it refreshes conversion rates; native
          amounts stay the same.
        </p>
        <select
          id="household-home-currency"
          aria-describedby="household-home-currency-hint"
          className={`mt-1.5 ${SELECT_CLASS}`}
          value={currencyValue}
          onChange={(e) => setCurrencyValue(e.target.value as CurrencyCode)}
          disabled={!canEdit || saving}
        >
          {CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="household-timezone" className="block text-sm font-semibold">
          Timezone
        </label>
        <p id="household-timezone-hint" className="text-sm text-muted-foreground">
          Budget periods and transaction dates use your household&apos;s local
          calendar day.
        </p>
        <select
          id="household-timezone"
          aria-describedby="household-timezone-hint"
          className={`mt-1.5 ${SELECT_CLASS}`}
          value={timezoneValue}
          onChange={(e) => setTimezoneValue(e.target.value)}
          disabled={!canEdit || saving}
        >
          {timezoneOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      {canEdit && (
        <Button type="submit" disabled={!canSave}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      )}
    </form>
  );
}
