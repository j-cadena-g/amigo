import { useEffect, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";

interface TransactionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function TransactionImportDialog({
  open,
  onOpenChange,
  onImported,
}: TransactionImportDialogProps) {
  const [importText, setImportText] = useState("");
  const [importDryRun, setImportDryRun] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const importCloseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
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
      if (importCloseTimeoutRef.current != null) {
        clearTimeout(importCloseTimeoutRef.current);
        importCloseTimeoutRef.current = null;
      }
      setImportFeedback(null);
    }
    onOpenChange(nextOpen);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportBusy(true);
    setImportFeedback(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(importText) as unknown;
      } catch {
        setImportFeedback("Invalid JSON.");
        return;
      }
      if (typeof parsed !== "object" || parsed === null || !("rows" in parsed)) {
        setImportFeedback('JSON must be an object with a "rows" array.');
        return;
      }
      const rows = (parsed as { rows: unknown }).rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        setImportFeedback('"rows" must be a non-empty array.');
        return;
      }
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, dryRun: importDryRun }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        count?: number;
        inserted?: number;
        error?: string;
        message?: string;
      } | null;
      if (!res.ok) {
        setImportFeedback(data?.error ?? data?.message ?? `Import failed (${res.status}).`);
        return;
      }
      if (importDryRun) {
        setImportFeedback(`Dry run OK — ${data?.count ?? rows.length} row(s) valid.`);
        return;
      }
      setImportFeedback(`Import complete — ${data?.inserted ?? 0} transaction(s) added.`);
      onImported();
      if (importCloseTimeoutRef.current != null) {
        clearTimeout(importCloseTimeoutRef.current);
      }
      importCloseTimeoutRef.current = window.setTimeout(() => {
        importCloseTimeoutRef.current = null;
        handleOpenChange(false);
      }, 1800);
    } finally {
      setImportBusy(false);
    }
  };

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
        <form onSubmit={handleImportSubmit} className="space-y-3">
          <textarea
            aria-label="Import transactions JSON"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            placeholder={`{\n  "rows": [\n    {\n      "date": "2026-01-15",\n      "type": "expense",\n      "category": "Groceries",\n      "amount": 12.34\n    }\n  ]\n}`}
            required
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={importDryRun}
              onChange={(e) => setImportDryRun(e.target.checked)}
              className="rounded border-input"
            />
            Dry run (validate only, no writes)
          </label>
          {importFeedback && (
            <p
              className={`text-sm ${
                importFeedback.startsWith("Import complete") ||
                importFeedback.startsWith("Dry run OK")
                  ? "text-green-600 dark:text-green-400"
                  : "text-destructive"
              }`}
            >
              {importFeedback}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={importBusy || !importText.trim()}>
              {importBusy ? "Sending…" : importDryRun ? "Validate" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
