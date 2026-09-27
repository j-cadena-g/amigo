import { Link } from "react-router";
import { Plus } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { PriceTag } from "@/app/components/price-tag";
import { Button } from "@/app/components/ui/button";
import { formatCents, formatSignedCents } from "@/app/lib/currency";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";

interface MonthHeroProps {
  monthName: string;
  todayStr: string;
  spendingCents: number;
  incomeCents: number;
  netCents: number;
  groceryCount: number;
  currency: CurrencyCode;
}

function daysLeftInMonth(todayStr: string): number {
  const [year, month, day] = todayStr.split("-").map(Number) as [number, number, number];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return daysInMonth - day;
}

export function MonthHero({
  monthName,
  todayStr,
  spendingCents,
  incomeCents,
  netCents,
  groceryCount,
  currency,
}: MonthHeroProps) {
  const t = useT();
  const locale = useLocale();
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <h1 className="type-display text-title-sm md:text-title">{monthName}</h1>
        <Button asChild>
          <Link to="/financial?new=1">
            <Plus />
            {t.transactions.add}
          </Link>
        </Button>
      </div>

      <div className="mt-5 flex flex-col items-start gap-4 md:flex-row md:items-end md:gap-6">
        <PriceTag cents={spendingCents} currency={currency} variant="tag" size="hero" />
        <div className="space-y-1 md:pb-1.5">
          <p className="text-heading font-semibold">
            {t.dashboard.spentSoFar} · {t.dashboard.daysLeft(daysLeftInMonth(todayStr))}
          </p>
          <p className="text-muted-foreground">
            <span className="font-mono font-medium text-foreground">
              {formatCents(incomeCents, currency, locale)}
            </span>{" "}
            {t.dashboard.in} ·{" "}
            <span className="font-mono font-medium text-foreground">
              {formatSignedCents(netCents, currency, locale, { showPlus: true })}
            </span>{" "}
            {t.dashboard.net} ·{" "}
            <Link
              to="/groceries"
              className="underline decoration-muted-foreground/60 underline-offset-4 hover:text-foreground hover:decoration-foreground"
            >
              {t.dashboard.onGroceryList(groceryCount)}
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
