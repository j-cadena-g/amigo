import type { CurrencyCode } from "@amigo/db";
import type { UpcomingRecurring } from "@/server/lib/dashboard-data";
import { formatSignedCents } from "@/app/lib/currency";
import { formatLedgerDate } from "@/app/lib/format-dates";
import { cn } from "@/app/lib/utils";
import { LedgerRow, LedgerSection, SectionLink } from "@/app/components/ledger";

interface DashboardUpcomingRecurringProps {
  items: UpcomingRecurring[];
  className?: string;
}

export function DashboardUpcomingRecurring({
  items,
  className,
}: DashboardUpcomingRecurringProps) {
  return (
    <LedgerSection
      title="Coming up"
      aside={<SectionLink to="/financial/recurring">Recurring</SectionLink>}
      className={className}
    >
      {items.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No recurring bills or pay scheduled.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((r) => (
            <LedgerRow
              key={r.id}
              date={formatLedgerDate(r.nextRunDate)}
              label={r.description || r.category}
              meta={`${r.description ? `${r.category} · ` : ""}${r.frequency.toLowerCase()}`}
              figure={
                <span className={cn(r.type === "income" && "text-success")}>
                  {formatSignedCents(
                    r.type === "income" ? r.amount : -r.amount,
                    r.currency as CurrencyCode,
                    { showPlus: true }
                  )}
                </span>
              }
            />
          ))}
        </ul>
      )}
    </LedgerSection>
  );
}
