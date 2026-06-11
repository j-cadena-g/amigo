import { Link } from "react-router";
import { CreditCard, Landmark, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { formatCents } from "@/app/lib/currency";
import { cn } from "@/app/lib/utils";
import type { CurrencyCode } from "@amigo/db";

interface DashboardNetWorthProps {
  netWorthCents: number;
  assetsCents: number;
  debtsCents: number;
  currency: CurrencyCode;
}

export function DashboardNetWorth({
  netWorthCents,
  assetsCents,
  debtsCents,
  currency,
}: DashboardNetWorthProps) {
  return (
    <Card className="lg:col-span-2 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-indigo-500/5 dark:from-violet-500/10 dark:to-indigo-500/10 pointer-events-none" />
      <CardHeader className="relative pb-2">
        <CardTitle className="text-base">Net Worth</CardTitle>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <div className="text-center py-2">
          <div
            className={cn(
              "font-display text-3xl font-bold tracking-tight",
              netWorthCents < 0 && "text-red-500 dark:text-red-400"
            )}
          >
            {formatCents(netWorthCents, currency)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total net worth</p>
        </div>

        <div className="space-y-2.5">
          <Link
            to="/financial"
            className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/50 group"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                <Landmark className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">Assets</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCents(assetsCents, currency)}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>

          <Link
            to="/financial/debts"
            className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/50 group"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400">
                <CreditCard className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">Debts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tabular-nums text-red-500 dark:text-red-400">
                {formatCents(debtsCents, currency)}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
