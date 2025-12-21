import { db, eq, and, isNull } from "@amigo/db";
import { debts } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { DebtCards } from "@/components/debt-cards";
import { AddDebtDialog } from "@/components/add-debt-dialog";

// Force dynamic rendering - page queries database
export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  // Fetch all debts for the household
  const allDebts = await db
    .select()
    .from(debts)
    .where(
      and(
        eq(debts.householdId, session.householdId),
        isNull(debts.deletedAt)
      )
    )
    .orderBy(debts.createdAt);

  // Calculate total debt
  // For LOAN: remaining = initial - current (loan amount - total paid)
  // For CREDIT_CARD: used = initial - current (limit - available)
  const totalDebt = allDebts.reduce((sum, debt) => {
    const initial = parseFloat(debt.balanceInitial);
    const current = parseFloat(debt.balanceCurrent);

    if (debt.type === "LOAN") {
      // Remaining loan balance
      return sum + Math.max(0, initial - current);
    } else {
      // Credit card used amount
      return sum + Math.max(0, initial - current);
    }
  }, 0);

  // Calculate average credit utilization (only for credit cards)
  const creditCards = allDebts.filter((d) => d.type === "CREDIT_CARD");
  const totalLimit = creditCards.reduce(
    (sum, cc) => sum + parseFloat(cc.balanceInitial),
    0
  );
  const totalUsed = creditCards.reduce((sum, cc) => {
    const limit = parseFloat(cc.balanceInitial);
    const available = parseFloat(cc.balanceCurrent);
    return sum + (limit - available);
  }, 0);
  const avgUtilization = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Debts</h1>
          <p className="text-gray-500">Track loans and credit cards</p>
        </div>
        <AddDebtDialog />
      </div>

      {/* Summary Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Debt</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            ${totalDebt.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">
            Credit Utilization
          </p>
          <p
            className={`mt-1 text-3xl font-bold ${
              avgUtilization > 30 ? "text-red-600" : "text-green-600"
            }`}
          >
            {avgUtilization.toFixed(1)}%
          </p>
          {creditCards.length === 0 && (
            <p className="mt-1 text-xs text-gray-400">No credit cards</p>
          )}
        </div>
      </div>

      {/* Debt Cards */}
      {allDebts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No debts tracked yet.</p>
          <p className="mt-1 text-sm text-gray-400">
            Add a loan or credit card to get started.
          </p>
        </div>
      ) : (
        <DebtCards debts={allDebts} />
      )}
    </main>
  );
}
