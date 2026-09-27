import { useEffect, useId, useState } from "react";
import { useRevalidator } from "react-router";
import type { CurrencyCode, FormatLocale } from "@amigo/db";
import { NativeSelect } from "@/app/components/financial/form-controls";
import { useToast } from "@/app/components/toast-provider";
import { toastMutationFailure } from "@/app/lib/api-error";
import { formatCents } from "@/app/lib/currency";
import { capitalizeFirst } from "@/app/lib/format-dates";
import { FORMAT_LOCALE_OPTIONS, formatLocaleLabel, isFormatLocale } from "@/app/lib/locale";

interface FormatSettingsProps {
  /** The saved choice; null follows the household's currency and the browser. */
  savedLocale: FormatLocale | null;
  /** What "Automatic" resolves to for this household and browser. */
  automaticLocale: FormatLocale;
  homeCurrency: CurrencyCode;
}

const PREVIEW_DATE = new Date(Date.UTC(2026, 8, 27));

export function FormatSettings({
  savedLocale,
  automaticLocale,
  homeCurrency,
}: FormatSettingsProps) {
  const selectId = useId();
  const previewId = useId();
  const revalidator = useRevalidator();
  const toast = useToast();
  const [value, setValue] = useState<FormatLocale | "">(savedLocale ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(savedLocale ?? "");
  }, [savedLocale]);

  async function save(next: FormatLocale | "") {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next === "" ? null : next }),
      });
      if (!res.ok) {
        setValue(previous);
        await toastMutationFailure(toast, res, "Save number and date format");
        return;
      }
      revalidator.revalidate();
    } catch {
      setValue(previous);
      await toastMutationFailure(toast, null, "Save number and date format");
    } finally {
      setSaving(false);
    }
  }

  // Follow the selection right away, before the save and revalidation finish.
  const previewLocale = value === "" ? automaticLocale : value;
  const preview = `${formatCents(123_456_78, homeCurrency, previewLocale)} · ${capitalizeFirst(
    PREVIEW_DATE.toLocaleDateString(previewLocale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
    previewLocale
  )}`;

  return (
    <div className="space-y-2">
      <label htmlFor={selectId} className="block text-sm font-semibold">
        Number and date format
      </label>
      <NativeSelect
        id={selectId}
        value={value}
        disabled={saving}
        aria-describedby={previewId}
        onChange={(e) => {
          const next = e.target.value;
          void save(isFormatLocale(next) ? next : "");
        }}
        className="max-w-sm"
      >
        <option value="">Automatic · {formatLocaleLabel(automaticLocale)}</option>
        {FORMAT_LOCALE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      <p id={previewId} className="text-sm text-muted-foreground">
        <span className="font-mono">{preview}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Applies to your account on every device. Automatic uses your household&apos;s
        currency, or your browser&apos;s language if it&apos;s different.
      </p>
    </div>
  );
}
