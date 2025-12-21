"use client";

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
import { DollarSign, TrendingDown } from "lucide-react";

interface CategoryData {
  category: string;
  amount: number;
  [key: string]: string | number;
}

interface BudgetChartsProps {
  totalSpending: number;
  categoryData: CategoryData[];
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
}: BudgetChartsProps) {
  const hasData = categoryData.length > 0;

  return (
    <div className="space-y-6">
      {/* Total Spending Card */}
      <div className="rounded-lg border bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-red-100 p-3">
            <TrendingDown className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Spending This Month</p>
            <p className="text-2xl font-bold">{formatCurrency(totalSpending)}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      {hasData ? (
        <>
          {/* Pie Chart */}
          <div className="rounded-lg border bg-white p-6">
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

          {/* Bar Chart */}
          <div className="rounded-lg border bg-white p-6">
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
        </>
      ) : (
        <div className="rounded-lg border bg-white p-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <DollarSign className="mb-4 h-12 w-12 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900">
              No expenses yet
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Add your first transaction to see spending charts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
