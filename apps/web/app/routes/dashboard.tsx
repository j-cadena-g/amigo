import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb } from "@amigo/db";
import { BudgetCharts } from "@/app/components/budget-charts";
import { Calendar } from "@/app/components/calendar";
import { DashboardStatCards } from "@/app/components/dashboard/stat-cards";
import { DashboardRecentTransactions } from "@/app/components/dashboard/recent-transactions";
import { DashboardBudgetProgress } from "@/app/components/dashboard/budget-progress";
import { DashboardUpcomingRecurring } from "@/app/components/dashboard/upcoming-recurring";
import { DashboardNetWorth } from "@/app/components/dashboard/net-worth";
import { loadDashboardData } from "@/server/lib/dashboard-data";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);
  return loadDashboardData(db, env, session);
}

export function meta() {
  return [{ title: "Dashboard · amigo" }];
}

export default function Dashboard() {
  const {
    spendingCents,
    incomeCents,
    netCents,
    groceryCount,
    currency,
    monthName,
    year,
    recentTransactions,
    budgetsWithSpending,
    upcomingRecurring,
    assetsCents,
    debtsCents,
    netWorthCents,
    categoryData,
    monthlyComparison,
    calendarEvents,
    calendarMonth,
    todayStr,
  } = useLoaderData<typeof loader>();

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 relative z-10">
      <h1 className="type-display mb-6 text-title-sm md:text-title">
        {monthName} {year}
      </h1>

      <DashboardStatCards
        spendingCents={spendingCents}
        incomeCents={incomeCents}
        netCents={netCents}
        groceryCount={groceryCount}
        currency={currency}
        monthName={monthName}
      />

      <section className="mb-6" aria-label="Monthly activity">
        <Calendar
          compact
          initialEvents={calendarEvents}
          initialMonth={calendarMonth}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <DashboardRecentTransactions
          transactions={recentTransactions}
          todayStr={todayStr}
        />
        <DashboardBudgetProgress
          budgets={budgetsWithSpending}
          currency={currency}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5 mt-4">
        <DashboardUpcomingRecurring items={upcomingRecurring} todayStr={todayStr} />
        <DashboardNetWorth
          netWorthCents={netWorthCents}
          assetsCents={assetsCents}
          debtsCents={debtsCents}
          currency={currency}
        />
      </div>

      {categoryData.length > 0 && (
        <div className="mt-4">
          <BudgetCharts
            categoryData={categoryData}
            monthlyComparison={monthlyComparison}
            currency={currency}
          />
        </div>
      )}
    </main>
  );
}
