import { Link } from "react-router";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatCents } from "@/app/lib/currency";
import { cn } from "@/app/lib/utils";
import type { CurrencyCode } from "@amigo/db";

interface DashboardStatCardsProps {
  spendingCents: number;
  incomeCents: number;
  netCents: number;
  groceryCount: number;
  currency: CurrencyCode;
  monthName: string;
}

function StatCard({
  to,
  label,
  value,
  valueClassName,
}: {
  to: string;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="transition-colors hover:bg-secondary">
        <CardContent className="p-4 md:p-5">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("mt-1 font-mono text-xl font-medium md:text-2xl", valueClassName)}>
            {value}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

export function DashboardStatCards({
  spendingCents,
  incomeCents,
  netCents,
  groceryCount,
  currency,
  monthName,
}: DashboardStatCardsProps) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        to="/financial?type=expense"
        label={`Spent in ${monthName}`}
        value={formatCents(spendingCents, currency)}
      />
      <StatCard
        to="/financial?type=income"
        label={`Received in ${monthName}`}
        value={formatCents(incomeCents, currency)}
        valueClassName="text-success"
      />
      <StatCard
        to="/financial"
        label="Net"
        value={`${netCents >= 0 ? "+" : ""}${formatCents(netCents, currency)}`}
        valueClassName={netCents < 0 ? "text-destructive" : undefined}
      />
      <StatCard
        to="/groceries"
        label="On the grocery list"
        value={String(groceryCount)}
      />
    </div>
  );
}
