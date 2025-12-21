import { db, eq, and, isNull, gte, sql } from "@amigo/db";
import { transactions } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { BudgetCharts } from "@/components/budget-charts";
import { TransactionList } from "@/components/transaction-list";

// Force dynamic rendering - page queries database
export const dynamic = "force-dynamic";

function getApiUrl(): string {
  // Return empty string for relative URLs - client will use current origin
  return "";
}

export default async function BudgetPage() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  // Get start of current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Fetch total spending this month (direct DB query - RSC pattern)
  const totalSpendingResult = await db
    .select({
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, session.householdId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        gte(transactions.date, startOfMonth)
      )
    );

  const totalSpending = parseFloat(totalSpendingResult[0]?.total ?? "0");

  // Fetch spending by category (aggregated)
  const spendingByCategory = await db
    .select({
      category: transactions.category,
      total: sql<string>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, session.householdId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        gte(transactions.date, startOfMonth)
      )
    )
    .groupBy(transactions.category);

  const categoryData = spendingByCategory.map((row) => ({
    category: row.category,
    amount: parseFloat(row.total ?? "0"),
  }));

  const apiUrl = getApiUrl();

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Budget</h1>
        <p className="text-gray-500">
          Track your spending for{" "}
          {now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Charts Section */}
        <BudgetCharts
          totalSpending={totalSpending}
          categoryData={categoryData}
        />

        {/* Transaction List Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Recent Transactions</h2>
          <TransactionList apiUrl={apiUrl} />
        </div>
      </div>
    </main>
  );
}
