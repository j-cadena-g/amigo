"use client";

import { useState, useEffect } from "react";
import { DollarSign, TrendingDown } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

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

// Tooltip styles that respect the current theme
const tooltipContentStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
};

const tooltipLabelStyle = {
  color: "hsl(var(--card-foreground))",
};

const tooltipCursorStyle = {
  fill: "hsl(var(--muted))",
  opacity: 0.3,
};

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
  const [isReady, setIsReady] = useState(false);
  const hasData = categoryData.length > 0;
  const hasComparisonData = monthlyComparison && monthlyComparison.length > 0;

  // Wait for client-side hydration before rendering charts
  useEffect(() => {
    // Use requestAnimationFrame to avoid synchronous setState warning
    const rafId = requestAnimationFrame(() => {
      setIsReady(true);
    });
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Get current and last month names for the comparison chart
  const now = new Date();
  const thisMonthName = now.toLocaleDateString("en-US", { month: "short" });
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
  const lastMonthName = lastMonth.toLocaleDateString("en-US", { month: "short" });


  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
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
          <div className="rounded-lg border bg-card p-6 overflow-hidden">
            <h3 className="mb-4 text-lg font-semibold">Spending by Category</h3>
            <div className="h-72 overflow-hidden">
              {isReady && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="35%"
                      labelLine={false}
                      outerRadius={70}
                      dataKey="amount"
                      nameKey="category"
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                      formatter={(value, _name, props) => [
                        formatCurrency(value as number),
                        props.payload?.category
                      ]}
                    />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Month-over-Month Comparison Bar Chart */}
          {hasComparisonData && (
            <div className="rounded-lg border bg-card p-6 overflow-hidden">
              <h3 className="mb-4 text-lg font-semibold">
                {thisMonthName} vs {lastMonthName}
              </h3>
              <div className="h-64 overflow-hidden">
                {isReady && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyComparison} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => `$${v}`}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="category"
                        width={70}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        cursor={tooltipCursorStyle}
                        formatter={(value) => formatCurrency(value as number)}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
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
                )}
              </div>
            </div>
          )}

          {/* Fallback: Category Breakdown (when no comparison data) */}
          {!hasComparisonData && (
            <div className="rounded-lg border bg-card p-6 overflow-hidden">
              <h3 className="mb-4 text-lg font-semibold">Category Breakdown</h3>
              <div className="h-64 overflow-hidden">
                {isReady && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => `$${v}`}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="category"
                        width={70}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        cursor={tooltipCursorStyle}
                        formatter={(value) => formatCurrency(value as number)}
                      />
                      <Bar dataKey="amount" fill="#0088FE" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
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
