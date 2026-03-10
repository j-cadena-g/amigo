import { cn } from "@/app/lib/utils";

interface CurrencySelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const CURRENCIES = [
  { code: "CAD", label: "CAD - Canadian Dollar" },
  { code: "USD", label: "USD - US Dollar" },
  { code: "EUR", label: "EUR - Euro" },
  { code: "GBP", label: "GBP - British Pound" },
  { code: "MXN", label: "MXN - Mexican Peso" },
];

export function CurrencySelect({ value, onChange, className }: CurrencySelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        className
      )}
    >
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
