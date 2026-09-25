import { useId } from "react";
import { Link } from "react-router";
import { cn } from "@/app/lib/utils";

interface LedgerSectionProps {
  title: string;
  /** Right side of the heading row: a link or a figure. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** A section heading over an ink rule, followed by hairline-divided rows. */
export function LedgerSection({
  title,
  aside,
  children,
  className,
}: LedgerSectionProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="flex items-baseline justify-between gap-4 border-b border-foreground pb-2">
        <h2 id={headingId} className="text-heading font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function SectionLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="text-sm font-semibold underline decoration-muted-foreground/60 underline-offset-4 hover:decoration-foreground"
    >
      {children}
    </Link>
  );
}

/** Ledger row: date column, label and meta, right-aligned figure. */
export function LedgerRow({
  date,
  label,
  meta,
  figure,
  className,
}: {
  date?: string;
  label: React.ReactNode;
  meta?: React.ReactNode;
  figure: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("flex items-baseline gap-3 py-2.5", className)}>
      {date && (
        <span className="w-14 shrink-0 font-mono text-sm text-muted-foreground">
          {date}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{label}</span>
        {meta && (
          <span className="block truncate text-sm text-muted-foreground">{meta}</span>
        )}
      </span>
      <span className="shrink-0 font-mono font-medium">{figure}</span>
    </li>
  );
}
