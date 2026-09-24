import type { CurrencyCode } from "@amigo/db";
import { formatCents } from "@/app/lib/currency";
import { LedgerSection } from "@/app/components/ledger";

const SHOWN_CATEGORIES = 6;

interface WhereItWentProps {
  categoryData: { category: string; amount: number }[];
  monthlyComparison?: { category: string; thisMonth: number; lastMonth: number }[];
  currency: CurrencyCode;
  monthShort: string;
  lastMonthShort: string;
  className?: string;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function WhereItWent({
  categoryData,
  monthlyComparison,
  currency,
  monthShort,
  lastMonthShort,
  className,
}: WhereItWentProps) {
  const sorted = [...categoryData].sort((a, b) => b.amount - a.amount);
  const shown = sorted.slice(0, SHOWN_CATEGORIES);
  const rest = sorted.slice(SHOWN_CATEGORIES);
  const rows =
    rest.length > 0
      ? [
          ...shown,
          {
            category: "Everything else",
            amount: rest.reduce((sum, r) => sum + r.amount, 0),
          },
        ]
      : shown;
  const lastMonth = new Map(
    (monthlyComparison ?? []).map((c) => [c.category, c.lastMonth])
  );
  const restLastMonth = rest.reduce(
    (sum, r) => sum + (lastMonth.get(r.category) ?? 0),
    0
  );
  const max = rows.reduce((m, r) => Math.max(m, r.amount), 0);

  return (
    <LedgerSection
      title="Where it went"
      aside={
        <span className="flex gap-4 text-sm text-muted-foreground">
          <span className="w-24 text-right">{monthShort}</span>
          {monthlyComparison && (
            <span className="hidden w-24 text-right sm:inline">{lastMonthShort}</span>
          )}
        </span>
      }
      className={className}
    >
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const previous =
            row.category === "Everything else"
              ? restLastMonth
              : (lastMonth.get(row.category) ?? 0);
          return (
            <li key={row.category} className="flex items-center gap-4 py-2.5">
              <span className="w-28 shrink-0 truncate font-semibold sm:w-40">
                {capitalize(row.category)}
              </span>
              <span aria-hidden="true" className="h-1.5 flex-1 bg-secondary">
                <span
                  className="block h-full bg-foreground"
                  style={{ width: `${max > 0 ? (row.amount / max) * 100 : 0}%` }}
                />
              </span>
              <span className="w-24 shrink-0 text-right font-mono font-medium">
                {formatCents(row.amount, currency)}
              </span>
              {monthlyComparison && (
                <span className="hidden w-24 shrink-0 text-right font-mono text-muted-foreground sm:inline">
                  {formatCents(previous, currency)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </LedgerSection>
  );
}
