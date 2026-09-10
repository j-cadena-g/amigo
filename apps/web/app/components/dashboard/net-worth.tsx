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
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-info/5 pointer-events-none" />
      <CardHeader className="relative pb-2">
        <CardTitle className="text-base">Net Worth</CardTitle>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <div className="text-center py-2">
          <div
            className={cn(
              "font-display text-3xl font-bold tracking-tight",
              netWorthCents < 0 && "text-destructive"
            )}
          >
            {formatCents(netWorthCents, currency)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total net worth</p>
        </div>

        <div className="space-y-2.5">
          <Link
            to="/financial/accounts"
            className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/50 group"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
                <Landmark className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">Assets</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tabular-nums text-success">
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
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <CreditCard className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">Debts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tabular-nums text-destructive">
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
