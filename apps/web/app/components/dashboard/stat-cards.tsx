import { Link } from "react-router";
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
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

export function DashboardStatCards({
  spendingCents,
  incomeCents,
  netCents,
  groceryCount,
  currency,
  monthName,
}: DashboardStatCardsProps) {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 animate-stagger-in mb-6">
      <Link to="/financial?type=expense" className="block">
        <Card className="card-interactive overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/10 to-warning/10 pointer-events-none" />
          <CardContent className="relative p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Spending
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/80 text-destructive">
                <ArrowDownRight className="h-4 w-4" />
              </div>
            </div>
            <div className="font-display text-xl font-bold tracking-tight md:text-2xl">
              {formatCents(spendingCents, currency)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{monthName}</p>
          </CardContent>
        </Card>
      </Link>

      <Link to="/financial?type=income" className="block">
        <Card className="card-interactive overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-success/10 to-accent/10 pointer-events-none" />
          <CardContent className="relative p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Income
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/80 text-success">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
            <div className="font-display text-xl font-bold tracking-tight md:text-2xl">
              {formatCents(incomeCents, currency)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{monthName}</p>
          </CardContent>
        </Card>
      </Link>

      <Link to="/financial" className="block">
        <Card className="card-interactive overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-info/10 to-primary/10 pointer-events-none" />
          <CardContent className="relative p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Net
              </span>
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl bg-background/80",
                  netCents >= 0
                    ? "text-info"
                    : "text-destructive"
                )}
              >
                {netCents >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
              </div>
            </div>
            <div
              className={cn(
                "font-display text-xl font-bold tracking-tight md:text-2xl",
                netCents < 0 && "text-destructive"
              )}
            >
              {netCents >= 0 ? "+" : ""}
              {formatCents(netCents, currency)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {netCents >= 0 ? "Looking good" : "In the red"}
            </p>
          </CardContent>
        </Card>
      </Link>

      <Link to="/groceries" className="block">
        <Card className="card-interactive overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-warning/10 to-warning/5 pointer-events-none" />
          <CardContent className="relative p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Groceries
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/80 text-warning">
                <ShoppingCart className="h-4 w-4" />
              </div>
            </div>
            <div className="font-display text-xl font-bold tracking-tight md:text-2xl">
              {groceryCount}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Active items</p>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
