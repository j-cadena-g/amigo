import { useId, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { formatCents } from "@/app/lib/currency";
import { getCreditCardSummary } from "@/app/lib/credit-card-summary";
import { cn } from "@/app/lib/utils";
import { PriceTag } from "@/app/components/price-tag";
import { EditDebtDialog } from "@/app/components/edit-debt-dialog";
import {
  LedgerGroup,
  LedgerSubgroup,
  RowIconButton,
} from "@/app/components/financial/ledger-group";

export interface Debt {
  id: string;
  name: string;
  type: "LOAN" | "CREDIT_CARD";
  /** For LOAN: loan amount in cents. For CREDIT_CARD: credit limit in cents. */
  balanceInitial: number;
  /** For LOAN: total paid in cents. For CREDIT_CARD: available credit in cents. */
  balanceCurrent: number;
  currency: CurrencyCode;
  exchangeRateToHome: number | null;
  userId: string | null;
  isShared?: boolean;
  createdAt: Date | number;
}

interface DebtCardsProps {
  debts: Debt[];
  homeCurrency: CurrencyCode;
  session: { userId: string; role: string };
}

type MeterTone = "default" | "warn" | "danger";

function utilizationTone(utilization: number): MeterTone {
  if (utilization > 100) return "danger";
  if (utilization > 30) return "warn";
  return "default";
}

const METER_FILL: Record<MeterTone, string> = {
  default: "bg-foreground",
  warn: "bg-warning",
  danger: "bg-destructive",
};

function MeterBar({
  percent,
  tone = "default",
  className,
}: {
  percent: number;
  tone?: MeterTone;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("h-1.5 w-full bg-secondary", className)}>
      <div
        className={cn("h-full", METER_FILL[tone])}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

export function DebtCards({ debts, homeCurrency, session: _session }: DebtCardsProps) {
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);

  const creditCardSummary = getCreditCardSummary(debts);
  const creditCards = debts.filter((d) => d.type === "CREDIT_CARD");
  const loans = debts.filter((d) => d.type === "LOAN");

  function renderBySharing(items: Debt[]) {
    const shared = items.filter((d) => d.isShared);
    const personal = items.filter((d) => !d.isShared);
    const renderRow = (debt: Debt) =>
      debt.type === "LOAN" ? (
        <LoanRow
          key={debt.id}
          debt={debt}
          homeCurrency={homeCurrency}
          onEdit={() => setEditingDebt(debt)}
        />
      ) : (
        <CreditCardRow
          key={debt.id}
          debt={debt}
          homeCurrency={homeCurrency}
          onEdit={() => setEditingDebt(debt)}
        />
      );

    return (
      <>
        {shared.length > 0 && (
          <LedgerSubgroup title="Shared">{shared.map(renderRow)}</LedgerSubgroup>
        )}
        {personal.length > 0 && (
          <LedgerSubgroup title="Personal">{personal.map(renderRow)}</LedgerSubgroup>
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-10">
        {creditCardSummary ? (
          <CreditCardSummary summary={creditCardSummary} homeCurrency={homeCurrency} />
        ) : null}
        {creditCards.length > 0 && (
          <LedgerGroup title="Credit cards">{renderBySharing(creditCards)}</LedgerGroup>
        )}
        {loans.length > 0 && (
          <LedgerGroup title="Loans">{renderBySharing(loans)}</LedgerGroup>
        )}
      </div>

      {editingDebt && (
        <EditDebtDialog
          debt={editingDebt}
          open={!!editingDebt}
          onOpenChange={(open) => {
            if (!open) setEditingDebt(null);
          }}
        />
      )}
    </>
  );
}

function CreditCardSummary({
  summary,
  homeCurrency,
}: {
  summary: NonNullable<ReturnType<typeof getCreditCardSummary>>;
  homeCurrency: CurrencyCode;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="text-sm font-semibold text-muted-foreground">
        Available credit
      </h3>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <PriceTag
          cents={summary.availableCreditCents}
          currency={homeCurrency}
          variant="plain"
          size="large"
        />
        <p className="font-mono text-sm font-medium">
          {summary.percentageUsed.toFixed(0)}% used
        </p>
      </div>
      <MeterBar
        percent={summary.percentageUsed}
        tone={utilizationTone(summary.percentageUsed)}
        className="mt-3"
      />
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="font-mono font-medium text-foreground">
          {formatCents(summary.usedCreditCents, homeCurrency)}
        </span>{" "}
        used of{" "}
        <span className="font-mono font-medium text-foreground">
          {formatCents(summary.totalLimitCents, homeCurrency)}
        </span>{" "}
        across {summary.cardCount} {summary.cardCount === 1 ? "card" : "cards"}
      </p>
    </section>
  );
}

function DebtRowLayout({
  name,
  figure,
  meter,
  details,
  onEdit,
}: {
  name: string;
  figure: string;
  meter: ReactNode;
  details: [string, string];
  onEdit: () => void;
}) {
  return (
    <li className="flex items-start gap-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="min-w-0 truncate font-semibold">{name}</span>
          <span className="shrink-0 font-mono text-sm font-medium">{figure}</span>
        </div>
        {meter}
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 text-sm text-muted-foreground">
          <span className="font-mono font-medium">{details[0]}</span>
          <span>{details[1]}</span>
        </div>
      </div>
      <RowIconButton className="-mr-2" onClick={onEdit} aria-label={`Edit ${name}`}>
        <Pencil />
      </RowIconButton>
    </li>
  );
}

function currencyNote(debt: Debt, homeCurrency: CurrencyCode): string {
  return debt.currency !== homeCurrency ? ` · ${debt.currency}` : "";
}

function LoanRow({
  debt,
  homeCurrency,
  onEdit,
}: {
  debt: Debt;
  homeCurrency: CurrencyCode;
  onEdit: () => void;
}) {
  const loanAmount = debt.balanceInitial;
  const totalPaid = debt.balanceCurrent;
  const remaining = loanAmount - totalPaid;
  const percentage = loanAmount > 0 ? (totalPaid / loanAmount) * 100 : 0;

  return (
    <DebtRowLayout
      name={debt.name}
      figure={`${formatCents(totalPaid, debt.currency)} of ${formatCents(loanAmount, debt.currency)}`}
      meter={<MeterBar percent={percentage} className="mt-2" />}
      details={[
        `${formatCents(Math.max(0, remaining), debt.currency)} left`,
        `${Math.min(100, percentage).toFixed(0)}% paid${currencyNote(debt, homeCurrency)}`,
      ]}
      onEdit={onEdit}
    />
  );
}

function CreditCardRow({
  debt,
  homeCurrency,
  onEdit,
}: {
  debt: Debt;
  homeCurrency: CurrencyCode;
  onEdit: () => void;
}) {
  const creditLimit = debt.balanceInitial;
  const availableCredit = debt.balanceCurrent;
  const usedAmount = creditLimit - availableCredit;
  const utilization = creditLimit > 0 ? (usedAmount / creditLimit) * 100 : 0;

  return (
    <DebtRowLayout
      name={debt.name}
      figure={
        usedAmount < 0
          ? `${formatCents(Math.abs(usedAmount), debt.currency)} unused credit`
          : `${formatCents(usedAmount, debt.currency)} of ${formatCents(creditLimit, debt.currency)}`
      }
      meter={
        <MeterBar percent={utilization} tone={utilizationTone(utilization)} className="mt-2" />
      }
      details={[
        `${formatCents(availableCredit, debt.currency)} available`,
        `${Math.max(0, utilization).toFixed(0)}% utilization${currencyNote(debt, homeCurrency)}`,
      ]}
      onEdit={onEdit}
    />
  );
}
