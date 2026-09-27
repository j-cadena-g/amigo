import { useCallback, useEffect, useRef, type ComponentProps, type Ref } from "react";
import type { CurrencyCode } from "@amigo/db";
import { Input } from "@/app/components/ui/input";
import { currencyFractionDigits } from "@/app/lib/currency";
import { amountValidationMessage } from "@/app/lib/decimal-input";
import { cn } from "@/app/lib/utils";

type AmountInputProps = Omit<
  ComponentProps<"input">,
  "type" | "inputMode" | "value" | "onChange" | "min" | "max" | "step" | "ref"
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Sets the placeholder's decimal places and formats `max` in messages. */
  currency?: CurrencyCode;
  allowNegative?: boolean;
  /** Reject 0, e.g. for a transaction or a loan amount. */
  positive?: boolean;
  /** Largest amount allowed, in major units. */
  max?: number;
  ref?: Ref<HTMLInputElement>;
};

/**
 * Money field that accepts "1,234.56" and "1.234,56" alike. A text input,
 * not `type="number"`, so "45.000" isn't read as 45; read the value with
 * `parseAmount`. Input is kept as typed, never rewritten, so a pasted "-45"
 * or "1e2" is rejected rather than saved as a different amount. Invalid
 * amounts block form submission like native min/max.
 */
export function AmountInput({
  value,
  onValueChange,
  currency,
  allowNegative = false,
  positive = false,
  max,
  placeholder,
  className,
  ref,
  ...props
}: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const message = amountValidationMessage(value, {
    allowNegative,
    positive,
    max,
    currency,
  });

  useEffect(() => {
    inputRef.current?.setCustomValidity(message);
  }, [message]);

  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  return (
    <Input
      {...props}
      ref={setRefs}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      placeholder={placeholder ?? (currencyFractionDigits(currency) === 0 ? "0" : "0.00")}
      className={cn("font-mono font-medium", className)}
    />
  );
}
