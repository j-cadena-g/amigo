import { getBudgetAnalytics } from "@amigo/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { BudgetCharts } from "@/components/budget-charts";
import { TransactionList } from "@/components/transaction-list";

// Force dynamic rendering - page queries database
export const dynamic = "force-dynamic";


export default async function BudgetPage() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  // Fetch budget analytics using the DB query function (RSC pattern)
  const analytics = await getBudgetAnalytics(session.householdId);

  const now = new Date();

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Budget</h1>
        <p className="text-muted-foreground">
          Track your spending for{" "}
          {now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Charts Section */}
        <BudgetCharts
          totalSpending={analytics.totalSpending}
          categoryData={analytics.categoryData}
          monthlyComparison={analytics.monthlyComparison}
        />

        {/* Transaction List Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Recent Transactions</h2>
          <TransactionList />
        </div>
      </div>
    </main>
  );
}
