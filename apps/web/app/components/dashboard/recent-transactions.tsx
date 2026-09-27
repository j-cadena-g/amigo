import type { CurrencyCode } from "@amigo/db";
import type { RecentTransaction } from "@/server/lib/dashboard-data";
import { formatSignedCents } from "@/app/lib/currency";
import { formatLedgerDate } from "@/app/lib/format-dates";
import { cn } from "@/app/lib/utils";
import { LedgerRow, LedgerSection, SectionLink } from "@/app/components/ledger";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";

interface DashboardRecentTransactionsProps {
  transactions: RecentTransaction[];
  className?: string;
}

export function DashboardRecentTransactions({
  transactions,
  className,
}: DashboardRecentTransactionsProps) {
  const t = useT();
  const locale = useLocale();
  return (
    <LedgerSection
      title={t.dashboard.recent}
      aside={<SectionLink to="/financial">{t.dashboard.viewAll}</SectionLink>}
      className={className}
    >
      {transactions.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t.dashboard.noTransactions}</p>
      ) : (
        <ul className="divide-y divide-border">
          {transactions.map((tx) => (
            <LedgerRow
              key={tx.id}
              date={formatLedgerDate(tx.date, locale)}
              label={tx.description || tx.category}
              meta={tx.description ? tx.category : undefined}
              figure={
                <span className={cn(tx.type === "income" && "text-success")}>
                  {formatSignedCents(
                    tx.type === "income" ? tx.amount : -tx.amount,
                    tx.currency as CurrencyCode,
                    locale,
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
