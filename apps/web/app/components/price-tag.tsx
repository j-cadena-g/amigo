import type { CurrencyCode } from "@amigo/db";
import { formatCentsParts, formatSignedCents } from "@/app/lib/currency";
import { cn } from "@/app/lib/utils";

interface PriceTagProps {
  cents: number;
  currency: CurrencyCode;
  /** `tag` is the yellow shelf tag; reserve it for the dashboard hero. */
  variant?: "tag" | "plain";
  size?: "hero" | "large";
  className?: string;
}

const SIZES = {
  hero: {
    whole: "text-hero-sm md:text-hero",
    small: "mt-[0.2em] text-2xl leading-none md:text-3xl md:leading-none",
    tag: "px-3 pb-1.5 pt-2.5 md:px-4 md:pb-2 md:pt-3.5",
  },
  large: {
    whole: "text-4xl leading-none md:text-5xl",
    small: "mt-[0.15em] text-base leading-none md:text-lg",
    tag: "px-2.5 pb-1 pt-2",
  },
} as const;

export function PriceTag({
  cents,
  currency,
  variant = "plain",
  size = "hero",
  className,
}: PriceTagProps) {
  const parts = formatCentsParts(cents, currency);
  const sizes = SIZES[size];
  const small = cn("type-display font-bold", sizes.small);

  return (
    <span
      className={cn(
        "inline-flex items-start",
        variant === "tag" && ["rounded-md bg-tag text-tag-foreground", sizes.tag],
        className
      )}
    >
      <span className="sr-only">{formatSignedCents(cents, currency)}</span>
      <span aria-hidden="true" className="inline-flex items-start">
        {parts.sign && (
          <span className={cn("type-display", sizes.whole)}>{parts.sign}</span>
        )}
        {parts.symbolPosition === "before" && (
          <span className={cn(small, "mr-0.5")}>{parts.symbol}</span>
        )}
        <span className={cn("type-display", sizes.whole)}>{parts.whole}</span>
        {parts.fraction && (
          <span className={cn(small, "ml-0.5")}>{parts.fraction}</span>
        )}
        {parts.symbolPosition === "after" && (
          <span className={cn(small, "ml-1")}>{parts.symbol}</span>
        )}
      </span>
    </span>
  );
}
