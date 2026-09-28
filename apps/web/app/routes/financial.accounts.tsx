import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { type MetaArgs, useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  financialAccounts,
  households,
  scopeToHousehold,
  eq,
  and,
  or,
  isNull,
  parseHomeCurrency,
  type CurrencyCode,
} from "@amigo/db";
import { Plus } from "lucide-react";
import { AccountCards } from "@/app/components/account-cards";
import { AddAccountDialog } from "@/app/components/add-account-dialog";
import { CreditUsageSummary, LiabilityRows } from "@/app/components/liability-rows";
import { EmptyState } from "@/app/components/empty-state";
import { FinancialSectionHeader } from "@/app/components/financial-section-header";
import { LedgerGroup } from "@/app/components/financial/ledger-group";
import { NetWorthSummary } from "@/app/components/net-worth-summary";
import { summarizeAccounts, sumBalancesHomeCents } from "@/app/lib/account-summary";
import { formatSignedCents } from "@/app/lib/currency";
import { isAssetHoldingType, isCashAndBankType } from "@/app/lib/financial-account-types";
import { Button } from "@/app/components/ui/button";
import { useLocale } from "@/app/lib/use-locale";
import { pageTitle, useT } from "@/app/i18n";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const household = await db.query.households.findFirst({
    where: eq(households.id, session.householdId),
  });

  const items = await db.query.financialAccounts.findMany({
    where: and(
      scopeToHousehold(financialAccounts.householdId, session.householdId),
      or(eq(financialAccounts.userId, session.userId), isNull(financialAccounts.userId)),
      isNull(financialAccounts.deletedAt)
    ),
    orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
  });

  const rows = items.map((a) => ({ ...a, isShared: a.userId === null }));

  return {
    accounts: rows.filter((a) => !a.archived).map((a) => ({ ...a, archived: false as const })),
    archivedAccounts: rows.filter((a) => a.archived).map((a) => ({ ...a, archived: true as const })),
    homeCurrency: parseHomeCurrency(household?.homeCurrency),
  };
}

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.accounts);
}

/** A section's signed balance in the home currency, beside its title. */
function SectionTotal({
  cents,
  homeCurrency,
}: {
  cents: number;
  homeCurrency: CurrencyCode;
}) {
  const locale = useLocale();
  return (
    <span className="font-mono font-medium">
      {formatSignedCents(cents, homeCurrency, locale)}
    </span>
  );
}

export default function FinancialAccounts() {
  const t = useT();
  const { accounts, archivedAccounts, homeCurrency } = useLoaderData<typeof loader>();
  const [addOpen, setAddOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const cashAndBank = accounts.filter((a) => isCashAndBankType(a.type));
  const holdings = accounts.filter((a) => isAssetHoldingType(a.type));
  const cards = accounts.filter((a) => a.type === "CREDIT");
  const loans = accounts.filter((a) => a.type === "LOAN");
  const summary = summarizeAccounts(accounts);
  const openAdd = () => setAddOpen(true);

  const total = (items: typeof accounts) => (
    <SectionTotal cents={sumBalancesHomeCents(items)} homeCurrency={homeCurrency} />
  );

  return (
    <div className="space-y-8">
      <FinancialSectionHeader
        title={t.nav.accounts}
        action={
          <Button type="button" onClick={openAdd}>
            <Plus />
            {t.accounts.add}
          </Button>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          message={t.accounts.empty}
          action={
            <Button type="button" onClick={openAdd}>
              <Plus />
              {t.accounts.add}
            </Button>
          }
        />
      ) : (
        <NetWorthSummary summary={summary} homeCurrency={homeCurrency} />
      )}

      {cashAndBank.length > 0 && (
        <LedgerGroup title={t.accounts.cashAndBank} aside={total(cashAndBank)}>
          <AccountCards accounts={cashAndBank} homeCurrency={homeCurrency} />
        </LedgerGroup>
      )}

      {holdings.length > 0 && (
        <LedgerGroup title={t.accounts.investmentsAndProperty} aside={total(holdings)}>
          <AccountCards accounts={holdings} homeCurrency={homeCurrency} />
        </LedgerGroup>
      )}

      {cards.length > 0 && (
        <LedgerGroup title={t.accounts.creditCards} aside={total(cards)}>
          {summary.creditUsage ? (
            <CreditUsageSummary usage={summary.creditUsage} homeCurrency={homeCurrency} />
          ) : null}
          <LiabilityRows accounts={cards} homeCurrency={homeCurrency} />
        </LedgerGroup>
      )}

      {loans.length > 0 && (
        <LedgerGroup title={t.accounts.loans} aside={total(loans)}>
          <LiabilityRows accounts={loans} homeCurrency={homeCurrency} />
        </LedgerGroup>
      )}

      {archivedAccounts.length > 0 && (
        <LedgerGroup
          title={t.accounts.archived}
          aside={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={showArchived}
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? t.accounts.hide : t.accounts.show(archivedAccounts.length)}
            </Button>
          }
        >
          {showArchived ? (
            <AccountCards accounts={archivedAccounts} homeCurrency={homeCurrency} />
          ) : null}
        </LedgerGroup>
      )}

      <AddAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultCurrency={homeCurrency}
      />
    </div>
  );
}
