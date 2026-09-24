import { useId, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";

/** One section of a Money tab: an h3 over an ink rule, then its rows. */
export function LedgerGroup({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  /** Right side of the heading row: totals or a toggle. */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-foreground pb-2">
        <h3 id={headingId} className="text-heading font-semibold">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A labelled run of rows inside a group, e.g. Shared or Personal. */
export function LedgerSubgroup({
  title,
  level = 4,
  children,
}: {
  title: string;
  level?: 3 | 4;
  children: ReactNode;
}) {
  const Heading = level === 3 ? "h3" : "h4";

  return (
    <div>
      <Heading className="pb-1 pt-4 text-sm font-semibold text-muted-foreground">
        {title}
      </Heading>
      <ul className="divide-y divide-border">{children}</ul>
    </div>
  );
}

/** Edit or delete icon at the end of a row. Needs an aria-label. */
export function RowIconButton({
  tone = "default",
  className,
  ...props
}: ButtonProps & { tone?: "default" | "destructive" }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-11 w-11 shrink-0 text-muted-foreground sm:h-9 sm:w-9",
        tone === "destructive" ? "hover:text-destructive" : "hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}
