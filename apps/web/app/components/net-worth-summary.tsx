import { useId } from "react";
import type { CurrencyCode } from "@amigo/db";
import { formatSignedCents } from "@/app/lib/currency";
import type { AccountsSummary } from "@/app/lib/account-summary";
import { PriceTag } from "@/app/components/price-tag";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";

/** Net worth over the household's accounts, with what it is made of. */
export function NetWorthSummary({
  summary,
  homeCurrency,
}: {
  summary: Pick<AccountsSummary, "netWorthCents" | "assetsCents" | "liabilitiesCents">;
  homeCurrency: CurrencyCode;
}) {
  const t = useT();
  const locale = useLocale();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="text-sm font-semibold text-muted-foreground">
        {t.dashboard.netWorth}
      </h3>
      <PriceTag
        cents={summary.netWorthCents}
        currency={homeCurrency}
        variant="plain"
        size="large"
        className="mt-2"
      />
      <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">{t.accounts.assets}</dt>
          <dd className="font-mono font-medium">
            {formatSignedCents(summary.assetsCents, homeCurrency, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t.accounts.liabilities}</dt>
          <dd className="font-mono font-medium">
            {/* Signed like the section totals and the dashboard: owed reads as negative. */}
            {formatSignedCents(0 - summary.liabilitiesCents, homeCurrency, locale)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
