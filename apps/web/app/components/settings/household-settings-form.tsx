import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { CURRENCY_CODES, type CurrencyCode } from "@amigo/db";
import { toastMutationFailure } from "@/app/lib/api-error";
import { buildTimezoneOptions } from "@/app/lib/timezones";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import { Button } from "@/app/components/ui/button";

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

  useEffect(() => {
    setNameValue(name);
    setCurrencyValue(homeCurrency);
    setTimezoneValue(timezone);
  }, [name, homeCurrency, timezone]);

  const trimmedName = nameValue.trim();
  const dirty =
    trimmedName !== name ||
    currencyValue !== homeCurrency ||
    timezoneValue !== timezone;
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
        await toastMutationFailure(toast, res, "Update household settings");
        return;
      }
      toast("Household settings updated");
      revalidator.revalidate();
    } catch {
      await toastMutationFailure(toast, null, "Update household settings");
    } finally {
      setSaving(false);
    }
  }

  const timezoneOptions = buildTimezoneOptions(timezoneValue);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label htmlFor="household-name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="household-name"
          type="text"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          maxLength={80}
          disabled={!canEdit || saving}
          required
        />
      </div>

      <div className="space-y-3">
        <label htmlFor="household-home-currency" className="text-sm font-medium">
          Home currency
        </label>
        <p className="text-sm text-muted-foreground">
          Used for household totals. Changing it refreshes conversion rates; native
          amounts stay the same.
        </p>
        <select
          id="household-home-currency"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

      <div className="space-y-3">
        <label htmlFor="household-timezone" className="text-sm font-medium">
          Timezone
        </label>
        <p className="text-sm text-muted-foreground">
          Budget periods and transaction dates use your household&apos;s local
          calendar day.
        </p>
        <select
          id="household-timezone"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
        <Button type="button" size="sm" onClick={handleSave} disabled={!canSave}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      )}
    </div>
  );
}
