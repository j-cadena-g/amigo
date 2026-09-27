import { useEffect, useId, useState } from "react";
import { useRevalidator } from "react-router";
import type { CurrencyCode, FormatLocale, UiLanguage } from "@amigo/db";
import { UI_LANGUAGES } from "@amigo/db";
import { NativeSelect } from "@/app/components/financial/form-controls";
import { useToast } from "@/app/components/toast-provider";
import { UI_LANGUAGE_LABELS, isUiLanguage, useT } from "@/app/i18n";
import { toastMutationFailure } from "@/app/lib/api-error";
import { formatCents } from "@/app/lib/currency";
import { capitalizeFirst } from "@/app/lib/format-dates";
import { FORMAT_LOCALE_OPTIONS, formatLocaleLabel, isFormatLocale } from "@/app/lib/locale";

interface RegionSettingsProps {
  /** Saved choices; null follows the household's currency and the browser. */
  savedLocale: FormatLocale | null;
  savedLanguage: UiLanguage | null;
  /** What "Automatic" resolves to for this household and browser. */
  automaticLocale: FormatLocale;
  automaticLanguage: UiLanguage;
  homeCurrency: CurrencyCode;
}

type Preference = "locale" | "language";

const PREVIEW_DATE = new Date(Date.UTC(2026, 8, 27));

function usePreference<T extends string>(
  saved: T | null,
  field: Preference,
  action: string
) {
  const revalidator = useRevalidator();
  const toast = useToast();
  const t = useT();
  const [value, setValue] = useState<T | "">(saved ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(saved ?? "");
  }, [saved]);

  async function save(next: T | "") {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next === "" ? null : next }),
      });
      if (!res.ok) {
        setValue(previous);
        await toastMutationFailure(toast, res, action, t.common);
        return;
      }
      revalidator.revalidate();
    } catch {
      setValue(previous);
      await toastMutationFailure(toast, null, action, t.common);
    } finally {
      setSaving(false);
    }
  }

  return { value, saving, save };
}

export function RegionSettings({
  savedLocale,
  savedLanguage,
  automaticLocale,
  automaticLanguage,
  homeCurrency,
}: RegionSettingsProps) {
  const t = useT();
  const languageId = useId();
  const formatId = useId();
  const previewId = useId();
  const language = usePreference(savedLanguage, "language", t.settings.region.saveLanguage);
  const format = usePreference(savedLocale, "locale", t.settings.region.saveFormat);

  // Follow the selection right away, before the save and revalidation finish.
  const previewLocale = format.value === "" ? automaticLocale : format.value;
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
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor={languageId} className="block text-sm font-semibold">
          {t.settings.region.language}
        </label>
        <NativeSelect
          id={languageId}
          value={language.value}
          disabled={language.saving}
          onChange={(e) => {
            const next = e.target.value;
            void language.save(isUiLanguage(next) ? next : "");
          }}
          className="max-w-sm"
        >
          <option value="">
            {t.settings.region.automatic(UI_LANGUAGE_LABELS[automaticLanguage])}
          </option>
          {UI_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {UI_LANGUAGE_LABELS[code]}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <label htmlFor={formatId} className="block text-sm font-semibold">
          {t.settings.region.format}
        </label>
        <NativeSelect
          id={formatId}
          value={format.value}
          disabled={format.saving}
          aria-describedby={previewId}
          onChange={(e) => {
            const next = e.target.value;
            void format.save(isFormatLocale(next) ? next : "");
          }}
          className="max-w-sm"
        >
          <option value="">
            {t.settings.region.automatic(formatLocaleLabel(automaticLocale))}
          </option>
          {FORMAT_LOCALE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
        <p id={previewId} className="text-sm text-muted-foreground">
          <span className="font-mono">{preview}</span>
        </p>
      </div>

      <p className="text-sm text-muted-foreground">{t.settings.region.hint}</p>
    </div>
  );
}
