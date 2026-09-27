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
import { useT } from "@/app/i18n";

interface TransactionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

type ImportFeedback = { tone: "success" | "error"; message: string };

export function TransactionImportDialog({
  open,
  onOpenChange,
  onImported,
}: TransactionImportDialogProps) {
  const t = useT();
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
        fail(t.imports.invalidJson);
        return;
      }
      if (typeof parsed !== "object" || parsed === null || !("rows" in parsed)) {
        fail(t.imports.needsRows);
        return;
      }
      const rows = (parsed as { rows: unknown }).rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        fail(t.imports.emptyRows);
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
        fail(data?.error ?? data?.message ?? t.common.couldNot(t.imports.action));
        return;
      }
      if (importDryRun) {
        const count = data?.count ?? rows.length;
        setImportFeedback({
          tone: "success",
          message: t.imports.ready(count),
        });
        return;
      }
      setImportFeedback({
        tone: "success",
        message: t.imports.imported(data?.inserted ?? 0),
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
      fail(t.common.couldNotConnection(t.imports.action));
    } finally {
      if (importAbortRef.current === controller) {
        importAbortRef.current = null;
      }
      setImportBusy(false);
    }
  };

  const busyLabel = importDryRun ? t.imports.checking : t.imports.importing;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.imports.title}</DialogTitle>
          <DialogDescription>
            {t.imports.help((name) => (
              <code className="text-xs">{name}</code>
            ))}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleImportSubmit} className="space-y-4">
          <textarea
            aria-label={t.imports.textareaLabel}
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
              {t.imports.dryRun}
            </label>
          </div>
          {importFeedback && (
            <p
              role={importFeedback.tone === "error" ? "alert" : "status"}
              className={cn(
                "text-sm",
                importFeedback.tone === "success"
                  ? "text-muted-foreground"
                  : "text-destructive"
              )}
            >
              {importFeedback.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={importBusy || !importText.trim()}>
              {importBusy ? busyLabel : importDryRun ? t.imports.check : t.imports.title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
