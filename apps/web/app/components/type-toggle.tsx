import { useMemo } from "react";
import { useRovingRadioGroup } from "@/app/lib/use-roving-radio-group";
import { cn } from "@/app/lib/utils";

export interface TypeToggleOption<T extends string> {
  value: T;
  label: string;
}

interface TypeToggleProps<T extends string> {
  /** Accessible name for the radio group. */
  label: string;
  options: readonly TypeToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Segmented control for picking one of a few kinds, e.g. expense or income. */
export function TypeToggle<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: TypeToggleProps<T>) {
  const values = useMemo(() => options.map((option) => option.value), [options]);
  const getRadioProps = useRovingRadioGroup(values, value, onChange);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex rounded-md border border-input p-0.5", className)}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            {...getRadioProps(option.value)}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-semibold transition-colors",
              checked
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
