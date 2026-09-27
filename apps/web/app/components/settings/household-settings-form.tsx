import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { CURRENCY_CODES, type CurrencyCode } from "@amigo/db";
import { toastMutationFailure } from "@/app/lib/api-error";
import { buildTimezoneOptions } from "@/app/lib/timezones";
import { currencyName } from "@/app/lib/currency";
import { useLanguage, useT } from "@/app/i18n";
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
  const t = useT();
  const language = useLanguage();
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
        title: t.settings.household.confirmCurrencyTitle,
        description: t.settings.household.confirmCurrencyBody,
        confirmText: t.settings.household.confirmCurrency,
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
        await toastMutationFailure(toast, res, t.settings.household.saveAction, t.common);
        return;
      }
      toast(t.settings.household.saved);
      revalidator.revalidate();
    } catch {
      await toastMutationFailure(toast, null, t.settings.household.saveAction, t.common);
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
        <p className="text-sm text-muted-foreground">{t.settings.household.readOnly}</p>
      )}

      <div>
        <label htmlFor="household-name" className="block text-sm font-semibold">
          {t.common.name}
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
          {t.settings.household.homeCurrency}
        </label>
        <p
          id="household-home-currency-hint"
          className="text-sm text-muted-foreground"
        >
          {t.settings.household.homeCurrencyHint}
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
              {`${code} – ${currencyName(code, language)}`}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="household-timezone" className="block text-sm font-semibold">
          {t.settings.household.timezone}
        </label>
        <p id="household-timezone-hint" className="text-sm text-muted-foreground">
          {t.settings.household.timezoneHint}
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
          {saving ? t.common.saving : t.settings.household.saveChanges}
        </Button>
      )}
    </form>
  );
}
