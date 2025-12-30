import { getBudgetAnalytics } from "@amigo/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { processDueRecurringTransactions } from "@/actions/recurring";
import { BudgetTabs } from "@/components/budget-tabs";

// Force dynamic rendering - page queries database
export const dynamic = "force-dynamic";


export default async function BudgetPage() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  // Lazy trigger: Process any due recurring transactions for this user before fetching data
  await processDueRecurringTransactions();

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

      <BudgetTabs analytics={analytics} />
    </main>
  );
}
