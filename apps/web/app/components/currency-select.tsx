import { NativeSelect } from "@/app/components/financial/form-controls";
import { SUPPORTED_CURRENCIES } from "@/app/lib/currency";

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
}

export function CurrencySelect({
  value,
  onChange,
  className,
  id,
  "aria-label": ariaLabel,
  compact = false,
}: CurrencySelectProps) {
  return (
    <NativeSelect
      id={id}
      aria-label={ariaLabel ?? (id ? undefined : "Currency")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      compact={compact}
      className={className}
    >
      {SUPPORTED_CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {compact ? c.code : `${c.code} – ${c.name}`}
        </option>
      ))}
    </NativeSelect>
  );
}
