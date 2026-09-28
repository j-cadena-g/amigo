import { CURRENCY_CODES } from "@amigo/db";
import { NativeSelect } from "@/app/components/financial/form-controls";
import { useLanguage, useT } from "@/app/i18n";
import { currencyName } from "@/app/lib/currency";

interface CurrencySelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Associates with a visible <label htmlFor={id}> when provided. */
  id?: string;
  /** Accessible name when no associated label (defaults to "Currency"). */
  "aria-label"?: string;
  /** Show 3-letter codes only — for narrow columns beside amount fields. */
  compact?: boolean;
  /** Codes to leave out, e.g. the amount's own currency for a card charge. */
  exclude?: readonly string[];
}

export function CurrencySelect({
  value,
  onChange,
  className,
  id,
  "aria-label": ariaLabel,
  compact = false,
  exclude,
}: CurrencySelectProps) {
  const t = useT();
  const language = useLanguage();
  return (
    <NativeSelect
      id={id}
      aria-label={ariaLabel ?? (id ? undefined : t.common.currency)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      compact={compact}
      className={className}
    >
      {CURRENCY_CODES.filter((code) => !exclude?.includes(code)).map((code) => (
        <option key={code} value={code}>
          {compact ? code : `${code} – ${currencyName(code, language)}`}
        </option>
      ))}
    </NativeSelect>
  );
}
