import { useState, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { CurrencyCode } from "@amigo/db";
import { formatCents } from "@/app/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

interface CategoryData {
  category: string;
  amount: number;
  [key: string]: string | number;
}

interface MonthlyComparison {
  category: string;
  thisMonth: number;
  lastMonth: number;
  [key: string]: string | number;
}

interface BudgetChartsProps {
  categoryData: CategoryData[];
  monthlyComparison?: MonthlyComparison[];
  currency?: CurrencyCode;
}

// Palette that complements the blue/teal theme
const CHART_COLORS = [
  "hsl(215, 65%, 53%)",  // blue (primary)
  "hsl(174, 50%, 38%)",  // teal green
  "hsl(37, 91%, 55%)",   // amber
  "hsl(210, 85%, 52%)",  // blue
  "hsl(280, 60%, 55%)",  // violet
  "hsl(180, 50%, 42%)",  // teal
  "hsl(340, 65%, 52%)",  // rose
  "hsl(60, 70%, 48%)",   // olive
];

function CustomTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; payload?: { category?: string } }>;
  currency: CurrencyCode;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!;
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2 shadow-lg text-sm">
      <p className="font-medium">{item.payload?.category ?? item.name}</p>
      <p className="text-muted-foreground tabular-nums">
        {formatCents(item.value, currency)}
      </p>
    </div>
  );
}

function ComparisonTooltip({
  active,
  payload,
  label,
  currency,
  thisMonthName,
  lastMonthName,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; dataKey: string }>;
  label?: string;
  currency: CurrencyCode;
  thisMonthName: string;
  lastMonthName: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2 shadow-lg text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-muted-foreground tabular-nums">
          {p.dataKey === "thisMonth" ? thisMonthName : lastMonthName}:{" "}
          <span className="text-foreground font-medium">
            {formatCents(p.value, currency)}
          </span>
        </p>
      ))}
    </div>
  );
}

export function BudgetCharts({
  categoryData,
  monthlyComparison,
  currency = "USD",
}: BudgetChartsProps) {
  const [isReady, setIsReady] = useState(false);
  const hasData = categoryData.length > 0;
  const hasComparisonData =
    monthlyComparison && monthlyComparison.length > 0;

  useEffect(() => {
    const rafId = requestAnimationFrame(() => setIsReady(true));
    return () => cancelAnimationFrame(rafId);
  }, []);

  const now = new Date();
  const thisMonthName = now.toLocaleDateString("en-US", { month: "short" });
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
  const lastMonthName = lastMonth.toLocaleDateString("en-US", {
    month: "short",
  });

  if (!hasData) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Pie Chart — Spending by Category */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Spending by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            {isReady && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="amount"
                    nameKey="category"
                    stroke="none"
                  >
                    {categoryData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<CustomTooltip currency={currency} />}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 justify-center">
            {categoryData.map((d, i) => (
              <div key={d.category} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      CHART_COLORS[i % CHART_COLORS.length],
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {d.category}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bar Chart — Month-over-month or Category breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {hasComparisonData
              ? `${thisMonthName} vs ${lastMonthName}`
              : "Category Breakdown"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            {isReady && hasComparisonData && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyComparison} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(v) =>
                      formatCents(v, currency, { compact: true })
                    }
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={70}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                    content={
                      <ComparisonTooltip
                        currency={currency}
                        thisMonthName={thisMonthName}
                        lastMonthName={lastMonthName}
                      />
                    }
                  />
                  <Bar
                    dataKey="thisMonth"
                    name={thisMonthName}
                    fill="hsl(215, 65%, 53%)"
                    radius={[0, 4, 4, 0]}
                  />
                  <Bar
                    dataKey="lastMonth"
                    name={lastMonthName}
                    fill="hsl(174, 50%, 38%)"
                    radius={[0, 4, 4, 0]}
                    opacity={0.6}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
            {isReady && !hasComparisonData && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(v) =>
                      formatCents(v, currency, { compact: true })
                    }
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={70}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                    content={<CustomTooltip currency={currency} />}
                  />
                  <Bar
                    dataKey="amount"
                    fill="hsl(215, 65%, 53%)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {/* Comparison legend */}
          {hasComparisonData && (
            <div className="flex gap-4 mt-2 justify-center">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: "hsl(215, 65%, 53%)" }}
                />
                <span className="text-xs text-muted-foreground">
                  {thisMonthName}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full opacity-60"
                  style={{ backgroundColor: "hsl(174, 50%, 38%)" }}
                />
                <span className="text-xs text-muted-foreground">
                  {lastMonthName}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
