import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
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
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Net worth</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p
          className={cn(
            "font-mono text-2xl font-medium",
            netWorthCents < 0 && "text-destructive"
          )}
        >
          {formatCents(netWorthCents, currency)}
        </p>

        <div className="divide-y divide-border border-t border-border">
          <Link
            to="/financial/accounts"
            className="group flex items-center justify-between py-2.5 text-sm"
          >
            <span className="font-semibold group-hover:underline">Accounts</span>
            <span className="flex items-center gap-1.5 font-mono font-medium">
              {formatCents(assetsCents, currency)}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </Link>
          <Link
            to="/financial/debts"
            className="group flex items-center justify-between py-2.5 text-sm"
          >
            <span className="font-semibold group-hover:underline">Debts</span>
            <span className="flex items-center gap-1.5 font-mono font-medium">
              {formatCents(-debtsCents, currency)}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
