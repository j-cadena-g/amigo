import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/app/lib/utils";
import {
  auditTimestampIso,
  formatAuditAction,
  formatAuditFieldName,
  formatAuditTimestamp,
  formatAuditValue,
  resolveAuditEntryCurrencies,
  resolveAuditTimeZone,
  visibleAuditChanges,
  type AuditChange,
  type AuditRecordCurrency,
} from "@/app/lib/audit-history";
import type { CurrencyCode } from "@amigo/db";

export type AuditTableName =
  | "grocery_items"
  | "transactions"
  | "budgets"
  | "financial_accounts"
  | "assets"
  | "debts"
  | "recurring_transactions";

type AuditHistoryEntry = {
  id: string;
  action: string;
  userName: string | null;
  timestamp: number;
  changes: Record<string, unknown> | null;
  recordCurrency?: AuditRecordCurrency | null;
};

interface AuditHistoryPanelProps {
  recordId: string;
  table: AuditTableName;
  /** IANA timezone; defaults to the browser timezone. */
  timeZone?: string;
  /** Household home currency for home-denominated audit fields. */
  homeCurrency?: CurrencyCode;
}

export function AuditHistoryPanel({
  recordId,
  table,
  timeZone,
  homeCurrency,
}: AuditHistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditHistoryEntry[] | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const cacheKey = `${table}:${recordId}`;

  useEffect(() => {
    if (!open || loadedKey === cacheKey) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetch(`/api/audit/${recordId}?table=${encodeURIComponent(table)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            message?: string;
            error?: string;
          } | null;
          throw new Error(
            data?.message ?? data?.error ?? "Failed to load history"
          );
        }
        return res.json() as Promise<{ history: AuditHistoryEntry[] }>;
      })
      .then((data) => {
        if (!cancelled) {
          setHistory(data.history);
          setLoadedKey(cacheKey);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load history");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, loadedKey, cacheKey, recordId, table]);

  const resolvedTimeZone = resolveAuditTimeZone(
    timeZone ??
      (typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC")
  );

  return (
    <div className="rounded-lg border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-medium">History</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div className="border-t px-3 py-3">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && history && history.length === 0 && (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          )}
          {!loading && !error && history && history.length > 0 && (
            <ul className="space-y-3">
              {history.map((entry) => {
                const changes = visibleAuditChanges(entry.changes);
                const sideCurrencies = resolveAuditEntryCurrencies(
                  entry.changes,
                  entry.recordCurrency
                );
                const formattedTime = formatAuditTimestamp(
                  entry.timestamp,
                  resolvedTimeZone
                );
                const isoTime = auditTimestampIso(entry.timestamp);
                return (
                  <li key={entry.id} className="text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span className="font-medium">
                        {formatAuditAction(entry.action)}
                        {entry.userName ? (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            by {entry.userName}
                          </span>
                        ) : null}
                      </span>
                      {formattedTime && isoTime ? (
                        <time
                          className="text-xs text-muted-foreground tabular-nums"
                          dateTime={isoTime}
                        >
                          {formattedTime}
                        </time>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Unknown time
                        </span>
                      )}
                    </div>
                    {changes.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                        {changes.map(([key, change]) => (
                          <li key={key}>
                            <span className="text-foreground/80">
                              {formatAuditFieldName(key)}
                            </span>
                            :{" "}
                            {formatAuditValue((change as AuditChange).from, {
                              field: key,
                              currency: sideCurrencies.from,
                              homeCurrency,
                            })}{" "}
                            →{" "}
                            {formatAuditValue((change as AuditChange).to, {
                              field: key,
                              currency: sideCurrencies.to,
                              homeCurrency,
                            })}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
