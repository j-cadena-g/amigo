import { useRef, useState } from "react";
import { CURRENCY_CODES, type CurrencyCode } from "@amigo/db";
import { CategorySelect } from "@/app/components/financial/category-select";
import { NativeSelect } from "@/app/components/financial/form-controls";
import { useFinancialCategories } from "@/app/components/financial/use-financial-categories";
import { SectionLink } from "@/app/components/ledger";
import { useToast } from "@/app/components/toast-provider";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
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
import {
  chosenCategories,
  editedDescriptions,
  sameMerchantTargets,
} from "@/app/lib/import-descriptions";
import { decodeOfxFile } from "@/app/lib/ofx-file";
import { formatCents } from "@/app/lib/currency";
import type { TransactionAccount } from "./transaction-row";

interface PreviewRow {
  date: string;
  type: "income" | "expense";
  description: string | null;
  bankDescription: string | null;
  amountCents: number;
  currency: CurrencyCode;
  externalId: string;
  duplicate: boolean;
  possibleDuplicate: boolean;
  defaultExcluded: boolean;
  canCorrect?: boolean;
  merchantKey: string | null;
  categoryId: string | null;
  categorySource: "user" | "ai" | "none";
  nameSource: "user" | "ai" | "none";
}

interface MerchantPrompt {
  categoryId: string | null;
  name: string;
  targetIds: string[];
}

/** Cleaned name, or the bank text when the cleaner left it blank. */
function previewName(row: PreviewRow): string {
  return row.description ?? row.bankDescription ?? "";
}

function editableRow(
  rows: PreviewRow[],
  repairCurrency: boolean,
  externalId: string
): boolean {
  const row = rows.find((candidate) => candidate.externalId === externalId);
  return row ? canEditName(row, repairCurrency) : false;
}

function categoryChoiceLabel(
  categories: { id: string; name: string }[],
  categoryId: string | null,
  uncategorized: string
): string {
  if (!categoryId) return uncategorized;
  return categories.find((category) => category.id === categoryId)?.name ?? uncategorized;
}

/** Same rows that show an include checkbox. Repair mode is view-only. */
function canEditName(row: PreviewRow, repairCurrency: boolean): boolean {
  return (
    !repairCurrency &&
    row.amountCents !== 0 &&
    !(row.duplicate && !row.possibleDuplicate)
  );
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
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
  } = useFinancialCategories();
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
  const [descriptionEdits, setDescriptionEdits] = useState<Map<string, string>>(
    () => new Map()
  );
  const [categoryChoices, setCategoryChoices] = useState<Map<string, string | null>>(
    () => new Map()
  );
  const [merchantPrompt, setMerchantPrompt] = useState<MerchantPrompt | null>(null);
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
      setDescriptionEdits(new Map());
      setCategoryChoices(new Map());
      setMerchantPrompt(null);
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
    setDescriptionEdits(new Map());
    setCategoryChoices(new Map());
    setMerchantPrompt(null);
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
          descriptions:
            dryRun || repairCurrency
              ? undefined
              : editedDescriptions(rows ?? [], descriptionEdits, excluded),
          categories:
            dryRun || repairCurrency
              ? undefined
              : chosenCategories(rows ?? [], categoryChoices, excluded, (externalId) =>
                  editableRow(rows ?? [], repairCurrency, externalId)
                ),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        rows?: PreviewRow[];
        inserted?: number;
        skipped?: number;
        corrected?: number;
        learned?: number;
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
                  row.defaultExcluded ||
                  row.possibleDuplicate ||
                  row.amountCents === 0
              )
              .map((row) => row.externalId)
          )
        );
        setDescriptionEdits(new Map());
        setCategoryChoices(new Map());
        setMerchantPrompt(null);
      } else {
        const summary = repairCurrency
          ? t.imports.corrected(data.corrected ?? 0)
          : t.imports.finished(data.inserted ?? 0, data.skipped ?? 0);
        const learned = data.learned ?? 0;
        toast(
          learned > 0 ? `${summary} ${t.imports.remembered(learned)}` : summary,
          { variant: "success" }
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
  // The blank option is Uncategorized, so a category with that name is omitted.
  const pickerCategories = categories.filter(
    (category) => category.name.toLowerCase() !== "uncategorized"
  );
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
            <p className="space-x-2 text-sm">
              <span>{t.imports.noAccounts}</span>
              <SectionLink to="/financial/accounts">{t.accounts.add}</SectionLink>
            </p>
          )}
          {rows && currencyMismatch && (
            <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
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
              {merchantPrompt && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    {t.imports.applyToMerchant(
                      categoryChoiceLabel(
                        categories,
                        merchantPrompt.categoryId,
                        t.imports.uncategorized
                      ),
                      merchantPrompt.targetIds.length,
                      merchantPrompt.name
                    )}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      const prompt = merchantPrompt;
                      setCategoryChoices((previous) => {
                        const next = new Map(previous);
                        for (const externalId of prompt.targetIds) {
                          next.set(externalId, prompt.categoryId);
                        }
                        return next;
                      });
                      setMerchantPrompt(null);
                    }}
                  >
                    {t.imports.apply}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setMerchantPrompt(null)}
                  >
                    {t.imports.dismiss}
                  </Button>
                </div>
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
                    {rows.map((row, index) => {
                      const editable = canEditName(row, repairCurrency);
                      const edited = descriptionEdits.get(row.externalId);
                      const name =
                        editable && edited !== undefined ? edited : previewName(row);
                      const choice = categoryChoices.get(row.externalId);
                      const categoryValue =
                        choice !== undefined ? (choice ?? "") : (row.categoryId ?? "");
                      const showSuggested =
                        row.categorySource === "ai" && choice === undefined;
                      const nameSuggested =
                        editable && row.nameSource === "ai" && edited === undefined;
                      return (
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
                                aria-label={`${t.imports.include} ${row.date} ${name}`}
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
                          <td className="min-w-0 p-2">
                            {editable ? (
                              <div className="flex min-w-0 items-center gap-2">
                                <Input
                                  size={1}
                                  maxLength={200}
                                  disabled={busy}
                                  aria-label={t.imports.nameFor(
                                    row.date,
                                    formatCents(row.amountCents, row.currency, locale)
                                  )}
                                  value={name}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setDescriptionEdits((previous) => {
                                      const next = new Map(previous);
                                      next.set(row.externalId, value);
                                      return next;
                                    });
                                  }}
                                  onBlur={() => {
                                    setDescriptionEdits((previous) => {
                                      const value = previous.get(row.externalId);
                                      if (value == null || value.trim() !== "")
                                        return previous;
                                      const next = new Map(previous);
                                      next.delete(row.externalId);
                                      return next;
                                    });
                                  }}
                                  className="h-8 w-full min-w-0 border-transparent bg-transparent px-1 py-0.5 text-sm focus-visible:border-input"
                                />
                                {nameSuggested && (
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {t.imports.suggested}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="wrap-break-word">{name}</span>
                            )}
                            {editable && (
                              <div className="mt-1 flex min-w-0 items-center gap-2">
                                <div className="min-w-0 flex-1 [&_select]:h-8 [&_select]:border-transparent [&_select]:bg-transparent [&_select]:py-0.5 [&_select]:pl-1 [&_select]:text-sm [&_select]:focus-visible:border-input">
                                  <CategorySelect
                                    type={row.type}
                                    categories={pickerCategories}
                                    value={categoryValue}
                                    disabled={
                                      busy || categoriesLoading || categoriesError != null
                                    }
                                    placeholder={t.imports.uncategorized}
                                    aria-label={t.imports.categoryFor(
                                      row.date,
                                      formatCents(row.amountCents, row.currency, locale)
                                    )}
                                    onChange={(value) => {
                                      const categoryId = value ? value : null;
                                      setCategoryChoices((previous) => {
                                        const next = new Map(previous);
                                        next.set(row.externalId, categoryId);
                                        return next;
                                      });
                                      const targets = sameMerchantTargets(
                                        rows,
                                        row.externalId,
                                        categoryId,
                                        categoryChoices,
                                        excluded,
                                        (externalId) =>
                                          editableRow(rows, repairCurrency, externalId)
                                      );
                                      setMerchantPrompt(
                                        targets.length
                                          ? { categoryId, name, targetIds: targets }
                                          : null
                                      );
                                    }}
                                  />
                                </div>
                                {showSuggested && (
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {t.imports.suggested}
                                  </span>
                                )}
                              </div>
                            )}
                            {row.bankDescription && row.bankDescription !== name && (
                              <span className="block wrap-break-word text-xs text-muted-foreground">
                                {row.bankDescription}
                              </span>
                            )}
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
                      );
                    })}
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
