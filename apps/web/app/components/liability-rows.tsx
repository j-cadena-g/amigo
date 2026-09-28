import { useId, useState } from "react";
import { Pencil } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { formatCents } from "@/app/lib/currency";
import type { CreditUsage } from "@/app/lib/account-summary";
import { cn } from "@/app/lib/utils";
import { PriceTag } from "@/app/components/price-tag";
import type { AccountRow } from "@/app/components/account-cards";
import { EditAccountDialog } from "@/app/components/edit-account-dialog";
import { LedgerSubgroup, RowIconButton } from "@/app/components/financial/ledger-group";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";

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

/** Credit usage across every card with a limit, above the card rows. */
export function CreditUsageSummary({
  usage,
  homeCurrency,
}: {
  usage: CreditUsage;
  homeCurrency: CurrencyCode;
}) {
  const t = useT();
  const locale = useLocale();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="pt-4">
      <h4 id={headingId} className="text-sm font-semibold text-muted-foreground">
        {t.accounts.availableCredit}
      </h4>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <PriceTag
          cents={usage.availableCents}
          currency={homeCurrency}
          variant="plain"
          size="large"
        />
        <p className="font-mono text-sm font-medium">
          {t.accounts.percentUsed(usage.percentUsed.toFixed(0))}
        </p>
      </div>
      <MeterBar
        percent={usage.percentUsed}
        tone={utilizationTone(usage.percentUsed)}
        className="mt-3"
      />
      <p className="mt-2 text-sm text-muted-foreground">
        {t.accounts.usedAcross(
          <span className="font-mono font-medium text-foreground">
            {formatCents(usage.owedCents, homeCurrency, locale)}
          </span>,
          <span className="font-mono font-medium text-foreground">
            {formatCents(usage.limitCents, homeCurrency, locale)}
          </span>,
          usage.cardCount
        )}
      </p>
    </section>
  );
}

function LiabilityRowLayout({
  account,
  figure,
  meter,
  homeCurrency,
  onEdit,
}: {
  account: AccountRow;
  figure: string;
  /** Left for the meter's amounts, right for its percentage; absent without a limit. */
  meter?: { percent: number; tone?: MeterTone; details: [string, string] };
  homeCurrency: CurrencyCode;
  onEdit: () => void;
}) {
  const t = useT();
  const currencyNote = account.currency !== homeCurrency ? account.currency : null;
  const detailLeft = meter?.details[0];
  const detailRight = [meter?.details[1], currencyNote].filter(Boolean).join(" · ");

  return (
    <li className="flex items-start gap-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="min-w-0 truncate font-semibold">{account.name}</span>
          <span className="shrink-0 font-mono text-sm font-medium">{figure}</span>
        </div>
        {meter ? (
          <MeterBar percent={meter.percent} tone={meter.tone} className="mt-2" />
        ) : null}
        {detailLeft || detailRight ? (
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 text-sm text-muted-foreground">
            {detailLeft ? <span className="font-mono font-medium">{detailLeft}</span> : null}
            {detailRight ? <span className="ml-auto">{detailRight}</span> : null}
          </div>
        ) : null}
      </div>
      <RowIconButton
        className="-mr-2"
        onClick={onEdit}
        aria-label={t.accounts.editNamed(account.name)}
      >
        <Pencil />
      </RowIconButton>
    </li>
  );
}

type RowProps = {
  account: AccountRow;
  homeCurrency: CurrencyCode;
  onEdit: () => void;
};

/** Owed against the limit, with usage. Without a limit only the amount owed shows. */
function CreditCardRow({ account, homeCurrency, onEdit }: RowProps) {
  const t = useT();
  const locale = useLocale();
  const fmt = (cents: number) => formatCents(cents, account.currency, locale);
  const owed = -account.balance;
  const limit = account.creditLimit ?? null;

  const figure =
    owed < 0
      ? t.accounts.unusedCredit(fmt(-owed))
      : limit === null
        ? fmt(owed)
        : t.accounts.amountOf(fmt(owed), fmt(limit));

  let meter: React.ComponentProps<typeof LiabilityRowLayout>["meter"];
  if (limit !== null) {
    const utilization = limit > 0 ? (Math.max(0, owed) / limit) * 100 : 0;
    meter = {
      percent: utilization,
      tone: utilizationTone(utilization),
      details: [
        t.accounts.available(fmt(limit + account.balance)),
        t.accounts.utilization(utilization.toFixed(0)),
      ],
    };
  }

  return (
    <LiabilityRowLayout
      account={account}
      figure={figure}
      meter={meter}
      homeCurrency={homeCurrency}
      onEdit={onEdit}
    />
  );
}

/** Paid against the original amount, with progress. Without one only what is left shows. */
function LoanRow({ account, homeCurrency, onEdit }: RowProps) {
  const t = useT();
  const locale = useLocale();
  const fmt = (cents: number) => formatCents(cents, account.currency, locale);
  const remaining = Math.max(0, -account.balance);
  const original = account.originalAmount ?? null;

  let figure = fmt(remaining);
  let meter: React.ComponentProps<typeof LiabilityRowLayout>["meter"];
  if (original !== null) {
    const paid = Math.max(0, original + account.balance);
    const percent = original > 0 ? Math.min(100, (paid / original) * 100) : 0;
    figure = t.accounts.amountOf(fmt(paid), fmt(original));
    meter = {
      percent,
      details: [t.accounts.left(fmt(remaining)), t.accounts.percentPaid(percent.toFixed(0))],
    };
  }

  return (
    <LiabilityRowLayout
      account={account}
      figure={figure}
      meter={meter}
      homeCurrency={homeCurrency}
      onEdit={onEdit}
    />
  );
}

interface LiabilityRowsProps {
  accounts: AccountRow[];
  homeCurrency: CurrencyCode;
}

/** Credit card or loan rows grouped Shared then Personal, each with an edit dialog. */
export function LiabilityRows({ accounts, homeCurrency }: LiabilityRowsProps) {
  const t = useT();
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const shared = accounts.filter((a) => a.isShared === true);
  const personal = accounts.filter((a) => a.isShared !== true);

  const renderRows = (items: AccountRow[]) =>
    items.map((a) => {
      const Row = a.type === "LOAN" ? LoanRow : CreditCardRow;
      return (
        <Row key={a.id} account={a} homeCurrency={homeCurrency} onEdit={() => setEditing(a)} />
      );
    });

  return (
    <>
      {shared.length > 0 && (
        <LedgerSubgroup title={t.accounts.shared}>{renderRows(shared)}</LedgerSubgroup>
      )}
      {personal.length > 0 && (
        <LedgerSubgroup title={t.accounts.personal}>{renderRows(personal)}</LedgerSubgroup>
      )}
      {editing && (
        <EditAccountDialog
          key={editing.id}
          account={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
    </>
  );
}
