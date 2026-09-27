import { Link } from "react-router";
import type { CurrencyCode } from "@amigo/db";
import { formatSignedCents } from "@/app/lib/currency";
import { LedgerSection } from "@/app/components/ledger";
import { useLocale } from "@/app/lib/use-locale";

interface DashboardNetWorthProps {
  netWorthCents: number;
  assetsCents: number;
  debtsCents: number;
  currency: CurrencyCode;
  className?: string;
}

function NetWorthRow({
  to,
  label,
  cents,
  currency,
}: {
  to: string;
  label: string;
  cents: number;
  currency: CurrencyCode;
}) {
  const locale = useLocale();
  return (
    <li>
      <Link
        to={to}
        className="group flex items-baseline justify-between gap-4 py-2.5"
      >
        <span className="font-semibold group-hover:underline">{label}</span>
        <span className="font-mono font-medium">
          {formatSignedCents(cents, currency, locale)}
        </span>
      </Link>
    </li>
  );
}

export function DashboardNetWorth({
  netWorthCents,
  assetsCents,
  debtsCents,
  currency,
  className,
}: DashboardNetWorthProps) {
  const locale = useLocale();
  return (
    <LedgerSection
      title="Net worth"
      aside={
        <span className="font-mono text-heading font-medium">
          {formatSignedCents(netWorthCents, currency, locale)}
        </span>
      }
      className={className}
    >
      <ul className="divide-y divide-border">
        <NetWorthRow
          to="/financial/accounts"
          label="Accounts"
          cents={assetsCents}
          currency={currency}
        />
        <NetWorthRow
          to="/financial/debts"
          label="Debts"
          cents={-debtsCents}
          currency={currency}
        />
      </ul>
    </LedgerSection>
  );
}
