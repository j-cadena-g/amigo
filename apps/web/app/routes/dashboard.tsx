import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb } from "@amigo/db";
import { MonthHero } from "@/app/components/dashboard/month-hero";
import { MonthStrip } from "@/app/components/dashboard/month-strip";
import { DashboardRecentTransactions } from "@/app/components/dashboard/recent-transactions";
import { DashboardBudgetProgress } from "@/app/components/dashboard/budget-progress";
import { DashboardUpcomingRecurring } from "@/app/components/dashboard/upcoming-recurring";
import { DashboardNetWorth } from "@/app/components/dashboard/net-worth";
import { WhereItWent } from "@/app/components/dashboard/where-it-went";
import { loadDashboardData } from "@/server/lib/dashboard-data";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);
  return loadDashboardData(db, env, session);
}

export function meta() {
  return [{ title: "Home · amigo" }];
}

function shortMonth(calendarMonth: string, offset: number): string {
  const [year, month] = calendarMonth.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

export default function Dashboard() {
  const {
    spendingCents,
    incomeCents,
    netCents,
    groceryCount,
    currency,
    monthName,
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
    <main className="container mx-auto px-4 py-6 md:px-6 md:py-8">
      <MonthHero
        monthName={monthName}
        todayStr={todayStr}
        spendingCents={spendingCents}
        incomeCents={incomeCents}
        netCents={netCents}
        groceryCount={groceryCount}
        currency={currency}
      />

      <MonthStrip
        events={calendarEvents}
        month={calendarMonth}
        todayStr={todayStr}
        currency={currency}
        className="mt-8"
      />

      <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <DashboardUpcomingRecurring items={upcomingRecurring} />
        <DashboardBudgetProgress budgets={budgetsWithSpending} currency={currency} />
        <DashboardRecentTransactions transactions={recentTransactions} />
        <DashboardNetWorth
          netWorthCents={netWorthCents}
          assetsCents={assetsCents}
          debtsCents={debtsCents}
          currency={currency}
        />
      </div>

      {categoryData.length > 0 && (
        <WhereItWent
          categoryData={categoryData}
          monthlyComparison={monthlyComparison}
          currency={currency}
          monthShort={shortMonth(calendarMonth, 0)}
          lastMonthShort={shortMonth(calendarMonth, -1)}
          className="mt-10"
        />
      )}
    </main>
  );
}
