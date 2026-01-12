import { redirect } from "next/navigation";
import { getPendingRestore } from "@/actions/restore";
import { RestoreAccountForm } from "@/components/restore-account-form";

export const dynamic = "force-dynamic";

export default async function RestoreAccountPage() {
  const restoreData = await getPendingRestore();

  if (!restoreData) {
    // No valid restore token, redirect to login
    redirect("/api/auth/login");
  }

  const { dataSummary, name, email } = restoreData;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Welcome Back!</h1>
          <p className="mt-2 text-muted-foreground">
            Hello {name ?? email}, your account was previously removed from the
            household.
          </p>
        </div>

        {dataSummary.total > 0 && (
          <div className="mb-8 rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Your Previous Data</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              We found data associated with your account:
            </p>
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
              {dataSummary.transactions > 0 && (
                <div className="rounded-md bg-muted p-3">
                  <p className="font-medium">{dataSummary.transactions}</p>
                  <p className="text-muted-foreground">Transactions</p>
                </div>
              )}
              {dataSummary.recurringTransactions > 0 && (
                <div className="rounded-md bg-muted p-3">
                  <p className="font-medium">
                    {dataSummary.recurringTransactions}
                  </p>
                  <p className="text-muted-foreground">Recurring</p>
                </div>
              )}
              {dataSummary.budgets > 0 && (
                <div className="rounded-md bg-muted p-3">
                  <p className="font-medium">{dataSummary.budgets}</p>
                  <p className="text-muted-foreground">Budgets</p>
                </div>
              )}
              {dataSummary.assets > 0 && (
                <div className="rounded-md bg-muted p-3">
                  <p className="font-medium">{dataSummary.assets}</p>
                  <p className="text-muted-foreground">Assets</p>
                </div>
              )}
              {dataSummary.debts > 0 && (
                <div className="rounded-md bg-muted p-3">
                  <p className="font-medium">{dataSummary.debts}</p>
                  <p className="text-muted-foreground">Debts</p>
                </div>
              )}
              {dataSummary.groceryItems > 0 && (
                <div className="rounded-md bg-muted p-3">
                  <p className="font-medium">{dataSummary.groceryItems}</p>
                  <p className="text-muted-foreground">Grocery Items</p>
                </div>
              )}
            </div>
          </div>
        )}

        <RestoreAccountForm hasData={dataSummary.total > 0} />
      </div>
    </main>
  );
}
