import type { LoaderFunctionArgs } from "react-router";
import { type MetaArgs, useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb } from "@amigo/db";
import { MonthHero } from "@/app/components/dashboard/month-hero";
import { MonthCalendar } from "@/app/components/dashboard/month-calendar";
import { DashboardRecentTransactions } from "@/app/components/dashboard/recent-transactions";
import { DashboardBudgetProgress } from "@/app/components/dashboard/budget-progress";
import { DashboardUpcomingRecurring } from "@/app/components/dashboard/upcoming-recurring";
import { DashboardNetWorth } from "@/app/components/dashboard/net-worth";
import { WhereItWent } from "@/app/components/dashboard/where-it-went";
import { loadDashboardData } from "@/server/lib/dashboard-data";
import { capitalizeFirst } from "@/app/lib/format-dates";
import { useLocale } from "@/app/lib/use-locale";
import { pageTitle } from "@/app/i18n";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);
  return loadDashboardData(db, env, session);
}

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.home);
}

function monthOf(
  calendarMonth: string,
  offset: number,
  locale: string,
  month: "short" | "long"
): string {
  const [year, monthNumber] = calendarMonth.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toLocaleDateString(locale, {
    month,
    timeZone: "UTC",
  });
}

export default function Dashboard() {
  const locale = useLocale();
  const {
    spendingCents,
    incomeCents,
    netCents,
    groceryCount,
    currency,
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
        monthName={capitalizeFirst(monthOf(calendarMonth, 0, locale, "long"), locale)}
        todayStr={todayStr}
        spendingCents={spendingCents}
        incomeCents={incomeCents}
        netCents={netCents}
        groceryCount={groceryCount}
        currency={currency}
      />

      <MonthCalendar
        events={calendarEvents}
        month={calendarMonth}
        todayStr={todayStr}
        currency={currency}
        className="mt-8"
      />

      <div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
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
          monthShort={monthOf(calendarMonth, 0, locale, "short")}
          lastMonthShort={monthOf(calendarMonth, -1, locale, "short")}
          className="mt-10"
        />
      )}
    </main>
  );
}
