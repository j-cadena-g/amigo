import { getBudgetAnalytics } from "@amigo/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { BudgetCharts } from "@/components/budget-charts";
import { TransactionList } from "@/components/transaction-list";

// Force dynamic rendering - page queries database
export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  const analytics = await getBudgetAnalytics(session.householdId, session.userId);

  return (
    <div className="grid gap-6 lg:grid-cols-2 w-full max-w-full overflow-hidden">
      {/* Charts Section */}
      <div className="min-w-0">
        <BudgetCharts
          totalSpending={analytics.totalSpending}
          categoryData={analytics.categoryData}
          monthlyComparison={analytics.monthlyComparison}
        />
      </div>

      {/* Transaction List Section */}
      <div className="space-y-4 min-w-0">
        <h2 className="text-xl font-semibold">Recent Transactions</h2>
        <TransactionList currentUserId={session.userId} />
      </div>
    </div>
  );
}
