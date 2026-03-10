import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, debts, scopeToHousehold, and, isNull } from "@amigo/db";
import { DebtCards } from "@/app/components/debt-cards";
import { AddDebtDialog } from "@/app/components/add-debt-dialog";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const items = await db.query.debts.findMany({
    where: and(
      scopeToHousehold(debts.householdId, session.householdId),
      isNull(debts.deletedAt)
    ),
    orderBy: (d, { asc }) => [asc(d.type), asc(d.name)],
  });

  return {
    debts: items,
    userId: session.userId,
  };
}

export default function Debts() {
  const { debts: debtData, userId } = useLoaderData<typeof loader>();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 relative z-10">
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Debts
          </h1>
          <p className="mt-1 text-muted-foreground">
            Loans and credit cards
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all duration-200 active:scale-[0.97]"
        >
          Add Debt
        </button>
        <AddDebtDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
      <DebtCards debts={debtData} session={{ userId }} />
    </main>
  );
}
