import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { cn } from "@/app/lib/utils";

interface TransactionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

type ImportFeedback = { tone: "success" | "error"; message: string };

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function TransactionImportDialog({
  open,
  onOpenChange,
  onImported,
}: TransactionImportDialogProps) {
  const dryRunId = useId();
  const [importText, setImportText] = useState("");
  const [importDryRun, setImportDryRun] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null);
  const importCloseTimeoutRef = useRef<number | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      importAbortRef.current?.abort();
      importAbortRef.current = null;
      if (importCloseTimeoutRef.current != null) {
        clearTimeout(importCloseTimeoutRef.current);
        importCloseTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setImportText("");
      setImportFeedback(null);
    }
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      importAbortRef.current?.abort();
      importAbortRef.current = null;
      if (importCloseTimeoutRef.current != null) {
        clearTimeout(importCloseTimeoutRef.current);
        importCloseTimeoutRef.current = null;
      }
      setImportFeedback(null);
    }
    onOpenChange(nextOpen);
  };

  const fail = (message: string) => setImportFeedback({ tone: "error", message });

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportBusy(true);
    setImportFeedback(null);
    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(importText) as unknown;
      } catch {
        fail("That isn't valid JSON. Check for a missing comma, quote, or bracket.");
        return;
      }
      if (typeof parsed !== "object" || parsed === null || !("rows" in parsed)) {
        fail('JSON must be an object with a "rows" array.');
        return;
      }
      const rows = (parsed as { rows: unknown }).rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        fail('"rows" needs at least one transaction.');
        return;
      }
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, dryRun: importDryRun }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        count?: number;
        inserted?: number;
        error?: string;
        message?: string;
      } | null;
      if (!res.ok) {
        fail(data?.error ?? data?.message ?? "Couldn't import the transactions. Try again.");
        return;
      }
      if (importDryRun) {
        const count = data?.count ?? rows.length;
        setImportFeedback({
          tone: "success",
          message: `${plural(count, "row", "rows")} ready. Turn off dry run to import.`,
        });
        return;
      }
      setImportFeedback({
        tone: "success",
        message: `Imported ${plural(data?.inserted ?? 0, "transaction", "transactions")}.`,
      });
      onImported();
      if (importCloseTimeoutRef.current != null) {
        clearTimeout(importCloseTimeoutRef.current);
      }
      importCloseTimeoutRef.current = window.setTimeout(() => {
        importCloseTimeoutRef.current = null;
        handleOpenChange(false);
      }, 1800);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      fail("Couldn't import the transactions. Check your connection and try again.");
    } finally {
      if (importAbortRef.current === controller) {
        importAbortRef.current = null;
      }
      setImportBusy(false);
    }
  };

  const busyLabel = importDryRun ? "Checking…" : "Importing…";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import transactions</DialogTitle>
          <DialogDescription>
            Paste JSON with a <code className="text-xs">rows</code> array. Each row needs{" "}
            <code className="text-xs">date</code>, <code className="text-xs">type</code>,{" "}
            <code className="text-xs">category</code>, and <code className="text-xs">amount</code> in
            major units (for example 12.34). Optional fields:{" "}
            <code className="text-xs">description</code>, <code className="text-xs">currency</code>,{" "}
            <code className="text-xs">budgetId</code>, <code className="text-xs">accountId</code>,{" "}
            <code className="text-xs">externalId</code>. Maximum 200 rows per request.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleImportSubmit} className="space-y-4">
          <textarea
            aria-label="Import transactions JSON"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            placeholder={`{\n  "rows": [\n    {\n      "date": "2026-01-15",\n      "type": "expense",\n      "category": "Groceries",\n      "amount": 12.34\n    }\n  ]\n}`}
            required
          />
          <div className="flex items-center gap-2">
            <input
              id={dryRunId}
              type="checkbox"
              checked={importDryRun}
              onChange={(e) => setImportDryRun(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-primary"
            />
            <label htmlFor={dryRunId} className="text-sm font-semibold">
              Dry run (check the rows without importing)
            </label>
          </div>
          {importFeedback && (
            <p
              role={importFeedback.tone === "error" ? "alert" : "status"}
              className={cn(
                "text-sm",
                importFeedback.tone === "success" ? "text-success" : "text-destructive"
              )}
            >
              {importFeedback.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={importBusy || !importText.trim()}>
              {importBusy ? busyLabel : importDryRun ? "Check rows" : "Import transactions"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
