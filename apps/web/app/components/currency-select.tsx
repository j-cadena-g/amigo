import { NativeSelect } from "@/app/components/financial/form-controls";

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

const CURRENCIES = [
  { code: "CAD", label: "CAD – Canadian dollar" },
  { code: "USD", label: "USD – US dollar" },
  { code: "EUR", label: "EUR – Euro" },
  { code: "GBP", label: "GBP – British pound" },
  { code: "MXN", label: "MXN – Mexican peso" },
];

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
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {compact ? c.code : c.label}
        </option>
      ))}
    </NativeSelect>
  );
}
