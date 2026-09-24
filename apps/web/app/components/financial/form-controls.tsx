import { useId, type ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { Button, type ButtonProps } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";

interface NativeSelectProps extends ComponentProps<"select"> {
  /** Tighter padding for narrow columns, e.g. a currency code beside an amount. */
  compact?: boolean;
}

/** `className` sizes the wrapper; the select fills it. */
export function NativeSelect({
  className,
  compact = false,
  children,
  ...props
}: NativeSelectProps) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <select
        {...props}
        className={cn(
          "flex h-10 w-full min-w-0 appearance-none rounded-md border border-input bg-background py-2 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          compact ? "pl-2.5 pr-8" : "pl-3 pr-9"
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export function SharedCheckbox({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-primary"
      />
      <label htmlFor={id} className="text-sm font-semibold">
        Shared with household
      </label>
    </div>
  );
}

export function DeleteButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn("text-destructive hover:text-destructive", className)}
      {...props}
    />
  );
}
