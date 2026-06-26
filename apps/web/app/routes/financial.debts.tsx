import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, debts, scopeToHousehold, eq, and, or, isNull } from "@amigo/db";
import { DebtCards } from "@/app/components/debt-cards";
import { AddDebtDialog } from "@/app/components/add-debt-dialog";
import { FinancialSectionHeader } from "@/app/components/financial-section-header";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const items = await db.query.debts.findMany({
    where: and(
      scopeToHousehold(debts.householdId, session.householdId),
      or(eq(debts.userId, session.userId), isNull(debts.userId)),
      isNull(debts.deletedAt)
    ),
    orderBy: (d, { asc }) => [asc(d.type), asc(d.name)],
  });

  return {
    debts: items.map((d) => ({ ...d, isShared: d.userId === null })),
    userId: session.userId,
    role: session.role,
  };
}

export default function FinancialDebts() {
  const { debts: debtData, userId, role } = useLoaderData<typeof loader>();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-4">
      <FinancialSectionHeader
        title="Debts"
        description="Loans and credit cards."
        action={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all duration-200 active:scale-[0.97]"
          >
            Add debt
          </button>
        }
      />
      <DebtCards debts={debtData} session={{ userId, role }} />
      <AddDebtDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
