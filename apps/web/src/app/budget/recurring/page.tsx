import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { processDueRecurringTransactions } from "@/actions/recurring";
import { RecurringList } from "@/components/recurring-list";

// Force dynamic rendering - page queries database
export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  // Lazy trigger: Process any due recurring transactions for this user
  await processDueRecurringTransactions();

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Recurring Rules</h2>
        <p className="text-sm text-muted-foreground">
          Set up automatic transactions that repeat on a schedule.
        </p>
      </div>
      <RecurringList currentUserId={session.userId} />
    </div>
  );
}
