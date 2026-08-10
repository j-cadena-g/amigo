import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  assets,
  financialAccounts,
  households,
  scopeToHousehold,
  eq,
  ne,
  and,
  or,
  isNull,
  parseHomeCurrency,
} from "@amigo/db";
import { AccountCards } from "@/app/components/account-cards";
import { AssetCards } from "@/app/components/asset-cards";
import { AddAccountDialog } from "@/app/components/add-account-dialog";
import { FinancialSectionHeader } from "@/app/components/financial-section-header";
import {
  isAssetHoldingType,
  isTransactionalAccountType,
} from "@/app/lib/financial-account-types";
import { Button } from "@/app/components/ui/button";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const household = await db.query.households.findFirst({
    where: eq(households.id, session.householdId),
  });

  const householdScope = scopeToHousehold(
    financialAccounts.householdId,
    session.householdId
  );
  const visibility = or(
    eq(financialAccounts.userId, session.userId),
    isNull(financialAccounts.userId)
  );

  const [accountItems, archivedAccountItems, legacyAssetItems] =
    await Promise.all([
      db.query.financialAccounts.findMany({
        where: and(
          householdScope,
          visibility,
          isNull(financialAccounts.deletedAt),
          eq(financialAccounts.archived, false),
          ne(financialAccounts.type, "CREDIT")
        ),
        orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
      }),
      db.query.financialAccounts.findMany({
        where: and(
          householdScope,
          visibility,
          isNull(financialAccounts.deletedAt),
          eq(financialAccounts.archived, true),
          ne(financialAccounts.type, "CREDIT")
        ),
        orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
      }),
      db.query.assets.findMany({
        where: and(
          scopeToHousehold(assets.householdId, session.householdId),
          or(eq(assets.userId, session.userId), isNull(assets.userId)),
          isNull(assets.deletedAt)
        ),
        orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
      }),
    ]);

  return {
    accounts: accountItems.map((a) => ({
      ...a,
      isShared: a.userId === null,
      archived: false as const,
    })),
    archivedAccounts: archivedAccountItems.map((a) => ({
      ...a,
      isShared: a.userId === null,
      archived: true as const,
    })),
    legacyAssets: legacyAssetItems.map((a) => ({
      ...a,
      isShared: a.userId === null,
    })),
    homeCurrency: parseHomeCurrency(household?.homeCurrency),
    userId: session.userId,
    role: session.role,
  };
}

export default function FinancialAccounts() {
  const { accounts, archivedAccounts, legacyAssets, homeCurrency, userId, role } =
    useLoaderData<typeof loader>();
  const [addOpen, setAddOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const transactional = accounts.filter((a) => isTransactionalAccountType(a.type));
  const holdings = accounts.filter((a) => isAssetHoldingType(a.type));

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <FinancialSectionHeader
          title="Holdings"
          description="Bank accounts, investments, and property. Link transactions and imports to checking, savings, and cash. Use Debts for credit cards."
          action={
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all duration-200 active:scale-[0.97]"
            >
              Add account
            </button>
          }
        />

        {transactional.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Accounts
            </h2>
            <AccountCards accounts={transactional} />
          </div>
        )}

        {holdings.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Investments & property
            </h2>
            <AccountCards accounts={holdings} />
          </div>
        )}

        {accounts.length === 0 && <AccountCards accounts={[]} />}

        {archivedAccounts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Archived
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowArchived((value) => !value)}
              >
                {showArchived
                  ? "Hide"
                  : `Show (${archivedAccounts.length})`}
              </Button>
            </div>
            {showArchived ? <AccountCards accounts={archivedAccounts} /> : null}
          </div>
        )}

        <AddAccountDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          defaultCurrency={homeCurrency}
        />
      </div>

      {legacyAssets.length > 0 && (
        <div className="space-y-4">
          <FinancialSectionHeader
            title="Legacy assets"
            description="Older asset entries. Convert each to an account, or delete when no longer needed."
          />
          <AssetCards assets={legacyAssets} session={{ userId, role }} />
        </div>
      )}
    </div>
  );
}
