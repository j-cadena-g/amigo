"use client";

import dynamic from "next/dynamic";
import { DollarSign, TrendingDown } from "lucide-react";

// Dynamically import Recharts components with SSR disabled to prevent hydration errors
const PieChart = dynamic(() => import("recharts").then((mod) => mod.PieChart), { ssr: false });
const Pie = dynamic(() => import("recharts").then((mod) => mod.Pie), { ssr: false });
const Cell = dynamic(() => import("recharts").then((mod) => mod.Cell), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((mod) => mod.ResponsiveContainer), { ssr: false });
const Legend = dynamic(() => import("recharts").then((mod) => mod.Legend), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), { ssr: false });
const BarChart = dynamic(() => import("recharts").then((mod) => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((mod) => mod.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((mod) => mod.CartesianGrid), { ssr: false });

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
  totalSpending: number;
  categoryData: CategoryData[];
  monthlyComparison?: MonthlyComparison[];
}

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884D8",
  "#82CA9D",
  "#FFC658",
  "#FF6B6B",
];

function formatCurrency(value: number | undefined): string {
  if (value === undefined) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function BudgetCharts({
  totalSpending,
  categoryData,
  monthlyComparison,
}: BudgetChartsProps) {
  const hasData = categoryData.length > 0;
  const hasComparisonData = monthlyComparison && monthlyComparison.length > 0;

  // Get current and last month names for the comparison chart
  const now = new Date();
  const thisMonthName = now.toLocaleDateString("en-US", { month: "short" });
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
  const lastMonthName = lastMonth.toLocaleDateString("en-US", { month: "short" });

  return (
    <div className="space-y-6">
      {/* Total Spending Card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-destructive/10 p-3">
            <TrendingDown className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Spending This Month</p>
            <p className="text-2xl font-bold">{formatCurrency(totalSpending)}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      {hasData ? (
        <>
          {/* Pie Chart */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="mb-4 text-lg font-semibold">Spending by Category</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="amount"
                    nameKey="category"
                    label={(props: { name?: string; percent?: number }) => {
                      const name = props.name ?? "";
                      const percent = props.percent ?? 0;
                      return `${name} (${(percent * 100).toFixed(0)}%)`;
                    }}
                  >
                    {categoryData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Month-over-Month Comparison Bar Chart */}
          {hasComparisonData && (
            <div className="rounded-lg border bg-card p-6">
              <h3 className="mb-4 text-lg font-semibold">
                {thisMonthName} vs {lastMonthName}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyComparison} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                    <YAxis
                      type="category"
                      dataKey="category"
                      width={100}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(value as number)}
                    />
                    <Legend />
                    <Bar
                      dataKey="thisMonth"
                      name={thisMonthName}
                      fill="#0088FE"
                    />
                    <Bar
                      dataKey="lastMonth"
                      name={lastMonthName}
                      fill="#82CA9D"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Fallback: Category Breakdown (when no comparison data) */}
          {!hasComparisonData && (
            <div className="rounded-lg border bg-card p-6">
              <h3 className="mb-4 text-lg font-semibold">Category Breakdown</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                    <YAxis
                      type="category"
                      dataKey="category"
                      width={100}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(value as number)}
                    />
                    <Bar dataKey="amount" fill="#0088FE" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <DollarSign className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">
              No expenses yet
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first transaction to see spending charts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
