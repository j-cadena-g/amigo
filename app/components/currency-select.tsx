import { ChevronDown } from "lucide-react";
import { cn } from "@/app/lib/utils";

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
  { code: "CAD", label: "CAD - Canadian Dollar" },
  { code: "USD", label: "USD - US Dollar" },
  { code: "EUR", label: "EUR - Euro" },
  { code: "GBP", label: "GBP - British Pound" },
  { code: "MXN", label: "MXN - Mexican Peso" },
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
    <div className={cn("relative min-w-0", className)}>
      <select
        id={id}
        aria-label={ariaLabel ?? (id ? undefined : "Currency")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "flex h-10 w-full min-w-0 appearance-none rounded-md border border-input bg-background py-2 text-sm",
          compact ? "pl-2.5 pr-8" : "pl-3 pr-9"
        )}
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {compact ? c.code : c.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}
