import type { CurrencyCode } from "@amigo/db";
import type { RecentTransaction } from "@/server/lib/dashboard-data";
import { formatSignedCents } from "@/app/lib/currency";
import { formatLedgerDate } from "@/app/lib/format-dates";
import { cn } from "@/app/lib/utils";
import { LedgerRow, LedgerSection, SectionLink } from "@/app/components/ledger";

interface DashboardRecentTransactionsProps {
  transactions: RecentTransaction[];
  className?: string;
}

export function DashboardRecentTransactions({
  transactions,
  className,
}: DashboardRecentTransactionsProps) {
  return (
    <LedgerSection
      title="Recent"
      aside={<SectionLink to="/financial">View all</SectionLink>}
      className={className}
    >
      {transactions.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No transactions yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {transactions.map((t) => (
            <LedgerRow
              key={t.id}
              date={formatLedgerDate(t.date)}
              label={t.description || t.category}
              meta={t.description ? t.category : undefined}
              figure={
                <span className={cn(t.type === "income" && "text-success")}>
                  {formatSignedCents(
                    t.type === "income" ? t.amount : -t.amount,
                    t.currency as CurrencyCode,
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
