import { useRef, useState } from "react";
import { CURRENCY_CODES, type CurrencyCode } from "@amigo/db";
import { NativeSelect } from "@/app/components/financial/form-controls";
import { useToast } from "@/app/components/toast-provider";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";
import { decodeOfxFile } from "@/app/lib/ofx-file";
import { formatCents } from "@/app/lib/currency";
import type { TransactionAccount } from "./transaction-row";

interface PreviewRow {
  date: string;
  type: "income" | "expense";
  description: string;
  amountCents: number;
  currency: CurrencyCode;
  externalId: string;
  duplicate: boolean;
  possibleDuplicate: boolean;
  defaultExcluded: boolean;
  canCorrect?: boolean;
}

export function TransactionImportDialog({
  open,
  onOpenChange,
  onImported,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  accounts: TransactionAccount[];
}) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [currencyOverride, setCurrencyOverride] = useState("");
  const [repairCurrency, setRepairCurrency] = useState(false);
  const [currencyMismatch, setCurrencyMismatch] = useState(false);
  const [acceptCurrencyMismatch, setAcceptCurrencyMismatch] = useState(false);
  const [accountCurrency, setAccountCurrency] = useState("");
  const [sourceCurrencies, setSourceCurrencies] = useState<string[]>([]);
  const [format, setFormat] = useState<"ofx" | "csv">("ofx");
  const [sourceBank, setSourceBank] = useState("");
  const confirmationId = useRef("");
  const [ofx, setOfx] = useState("");
  const [accountId, setAccountId] = useState("");
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const close = (next: boolean) => {
    if (!next) {
      generation.current++;
      setOfx("");
      setRows(null);
      setError(null);
      setBusy(false);
      setAccountId("");
      setSourceBank("");
      setFormat("ofx");
      setCurrencyOverride("");
      setRepairCurrency(false);
      setAcceptCurrencyMismatch(false);
      setCurrencyMismatch(false);
      setExcluded(new Set());
    }
    onOpenChange(next);
  };
  const readFile = async (file: File | undefined) => {
    const current = ++generation.current;
    setRows(null);
    setSourceBank("");
    setCurrencyOverride("");
    setRepairCurrency(false);
    setAcceptCurrencyMismatch(false);
    setCurrencyMismatch(false);
    setOfx("");
    setError(null);
    setExcluded(new Set());
    if (!file) return;
    if (!/\.(ofx|qfx|csv)$/i.test(file.name) || file.size > 2 * 1024 * 1024) {
      setError(t.imports.fileError);
      return;
    }
    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const csv = /\.csv$/i.test(file.name);
      const text = csv
        ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
        : decodeOfxFile(bytes);
      if (current === generation.current) setFormat(csv ? "csv" : "ofx");
      if (current === generation.current) setOfx(text);
    } catch {
      if (current === generation.current) setError(t.imports.fileError);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  const submit = async (dryRun: boolean) => {
    const current = generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [format]: ofx,
          currencyOverride: currencyOverride || undefined,
          repairCurrency,
          acceptCurrencyMismatch,
          sourceBank: sourceBank || undefined,
          duplicateConfirmationId: confirmationId.current || undefined,
          confirmedDuplicateIds: dryRun
            ? []
            : (rows ?? [])
                .filter(
                  (row) =>
                    row.possibleDuplicate && !excluded.has(row.externalId)
                )
                .map((row) => row.externalId),
          accountId,
          dryRun,
          excludedIds: dryRun ? [] : [...excluded],
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        rows?: PreviewRow[];
        inserted?: number;
        skipped?: number;
        corrected?: number;
        currencyMismatch?: boolean;
        accountCurrency?: string;
        sourceCurrencies?: string[];
      };
      if (response.ok && !dryRun) onImported();
      if (current !== generation.current) return;
      if (!response.ok) {
        setError(data.error ?? t.imports.fileError);
        return;
      }
      if (dryRun && data.rows) {
        setRows(data.rows);
        setCurrencyMismatch(data.currencyMismatch ?? false);
        setAcceptCurrencyMismatch(false);
        setAccountCurrency(data.accountCurrency ?? "");
        setSourceCurrencies(data.sourceCurrencies ?? []);
        confirmationId.current = crypto.randomUUID();
        // Credits may be payments/transfers. Require explicit inclusion as income.
        setExcluded(
          new Set(
            data.rows
              .filter(
                (row) =>
                  row.defaultExcluded || row.duplicate || row.amountCents === 0
              )
              .map((row) => row.externalId)
          )
        );
      } else {
        toast(
          repairCurrency
            ? t.imports.corrected(data.corrected ?? 0)
            : t.imports.finished(data.inserted ?? 0, data.skipped ?? 0),
          {
            variant: "success",
          }
        );
        close(false);
      }
    } catch {
      if (current === generation.current)
        setError(t.common.couldNotConnection(t.imports.action));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  const selected =
    rows?.filter(
      (row) =>
        (!repairCurrency || row.canCorrect) &&
        (!row.duplicate || row.possibleDuplicate) &&
        row.amountCents > 0 &&
        !excluded.has(row.externalId)
    ).length ?? 0;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.imports.title}</DialogTitle>
          <DialogDescription>{t.imports.ofxHelp}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex flex-col gap-2 text-sm">
            <span>{t.imports.file}</span>
            <input
              className="block w-full rounded-md text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-4 file:py-2 file:font-semibold file:transition-colors hover:file:bg-secondary hover:file:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              type="file"
              accept=".ofx,.qfx,.csv"
              disabled={busy}
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
          </label>
          {format === "ofx" && (
            <label className="flex flex-col gap-2 text-sm">
              <span>{t.imports.bank}</span>
              <NativeSelect
                className="w-full"
                value={sourceBank}
                disabled={busy}
                onChange={(e) => {
                  setSourceBank(e.target.value);
                  setRows(null);
                  setError(null);
                }}
              >
                <option value="">{t.imports.bankFromFile}</option>
                <option value="nbc">National Bank</option>
                <option value="scotiabank">Scotiabank</option>
                <option value="rbc">RBC</option>
                <option value="pcfinancial">PC Financial</option>
              </NativeSelect>
            </label>
          )}
          <label className="flex flex-col gap-2 text-sm">
            <span>{t.imports.account}</span>
            <NativeSelect
              className="w-full"
              value={accountId}
              disabled={busy}
              onChange={(e) => {
                setAccountId(e.target.value);
                setRows(null);
                setError(null);
              }}
            >
              <option value="">{t.imports.chooseAccount}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          {format === "ofx" && (
            <>
              <label className="flex flex-col gap-2 text-sm">
                <span>{t.imports.amountCurrency}</span>
                <NativeSelect
                  value={currencyOverride}
                  disabled={busy}
                  onChange={(e) => {
                    setCurrencyOverride(e.target.value);
                    setRepairCurrency(false);
                    setRows(null);
                    setAcceptCurrencyMismatch(false);
                  }}
                >
                  <option value="">{t.imports.useFileCurrency}</option>
                  {CURRENCY_CODES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {currencyOverride && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t.imports.overrideHelp}
                  </p>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={repairCurrency}
                      disabled={busy}
                      onChange={(e) => {
                        setRepairCurrency(e.target.checked);
                        setRows(null);
                      }}
                    />
                    <span>{t.imports.repairCurrency}</span>
                  </label>
                </>
              )}
            </>
          )}
          {!accounts.length && (
            <p className="text-sm">{t.imports.noAccounts}</p>
          )}
          {rows && currencyMismatch && (
            <div className="space-y-2 rounded-xl border border-warning p-3 text-sm">
              <p>{t.imports.currencyMismatch(accountCurrency)}</p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={busy}
                  checked={acceptCurrencyMismatch}
                  onChange={(e) => setAcceptCurrencyMismatch(e.target.checked)}
                />
                <span>{t.imports.acceptCurrencyMismatch}</span>
              </label>
            </div>
          )}
          {rows && (
            <>
              <p className="text-sm">
                {t.imports.previewSummary(
                  selected,
                  rows.filter(
                    (row) =>
                      row.duplicate &&
                      (!row.possibleDuplicate || excluded.has(row.externalId))
                  ).length
                )}
              </p>
              {rows.some((row) => row.type === "income") && (
                <p className="text-sm text-muted-foreground">
                  {t.imports.creditsWarning}
                </p>
              )}
              {format === "csv" && (
                <p className="text-sm text-muted-foreground">
                  {t.imports.csvWarning}
                </p>
              )}
              <p className="text-sm">
                {t.imports.currency}:{" "}
                {[...new Set(rows.map((row) => row.currency))].join(", ")}
              </p>
              <p className="text-sm">
                {t.imports.originalCurrency}: {sourceCurrencies.join(", ")}
              </p>
              {repairCurrency && (
                <p className="text-sm">{t.imports.repairHelp}</p>
              )}
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th>{t.imports.include}</th>
                      <th>{t.imports.date}</th>
                      <th>{t.imports.description}</th>
                      <th>{t.imports.amount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr
                        key={`${row.externalId}-${index}`}
                        className="border-t"
                      >
                        <td className="p-2">
                          {repairCurrency && !row.canCorrect ? (
                            <span>{t.imports.noCorrection}</span>
                          ) : row.amountCents === 0 ? (
                            <span>{t.imports.zeroAmount}</span>
                          ) : row.duplicate && !row.possibleDuplicate ? (
                            <span>{t.imports.duplicate}</span>
                          ) : (
                            <input
                              type="checkbox"
                              disabled={busy}
                              aria-label={`${t.imports.include} ${row.date} ${row.description}`}
                              checked={!excluded.has(row.externalId)}
                              onChange={(e) =>
                                setExcluded((previous) => {
                                  const next = new Set(previous);
                                  if (e.target.checked)
                                    next.delete(row.externalId);
                                  else next.add(row.externalId);
                                  return next;
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="p-2 font-mono whitespace-nowrap">{row.date}</td>
                        <td className="p-2">
                          {row.description}
                          {row.possibleDuplicate && (
                            <span className="block text-xs">
                              {t.imports.possibleDuplicate}
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-mono font-medium whitespace-nowrap">
                          {row.type === "expense" ? "−" : "+"}
                          {formatCents(row.amountCents, row.currency, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => close(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              disabled={
                busy ||
                !ofx ||
                !accountId ||
                (!!rows &&
                  (!selected || (currencyMismatch && !acceptCurrencyMismatch)))
              }
              onClick={() => void submit(!rows)}
            >
              {busy
                ? rows
                  ? t.imports.importing
                  : t.imports.checking
                : rows
                  ? repairCurrency
                    ? t.imports.correctCurrency
                    : t.imports.title
                  : t.imports.preview}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
