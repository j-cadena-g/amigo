import type { CurrencyCode } from "@amigo/db";
import type { UpcomingRecurring } from "@/server/lib/dashboard-data";
import { formatSignedCents } from "@/app/lib/currency";
import { formatLedgerDate } from "@/app/lib/format-dates";
import { cn } from "@/app/lib/utils";
import { LedgerRow, LedgerSection, SectionLink } from "@/app/components/ledger";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";

interface DashboardUpcomingRecurringProps {
  items: UpcomingRecurring[];
  className?: string;
}

export function DashboardUpcomingRecurring({
  items,
  className,
}: DashboardUpcomingRecurringProps) {
  const t = useT();
  const frequencies: Record<string, string> = t.common.frequencies;
  const frequencyLabel = (frequency: string) =>
    (frequencies[frequency] ?? frequency).toLocaleLowerCase();
  const locale = useLocale();
  return (
    <LedgerSection
      title={t.dashboard.comingUp}
      aside={<SectionLink to="/financial/recurring">{t.nav.recurring}</SectionLink>}
      className={className}
    >
      {items.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t.dashboard.nothingScheduled}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((r) => (
            <LedgerRow
              key={r.id}
              date={formatLedgerDate(r.nextRunDate, locale)}
              label={r.description || r.category}
              meta={`${r.description ? `${r.category} · ` : ""}${frequencyLabel(r.frequency)}`}
              figure={
                <span className={cn(r.type === "income" && "text-success")}>
                  {formatSignedCents(
                    r.type === "income" ? r.amount : -r.amount,
                    r.currency as CurrencyCode,
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
