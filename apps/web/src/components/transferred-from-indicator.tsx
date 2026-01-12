"use client";

import { useState } from "react";
import { ArrowRightLeft, History } from "lucide-react";
import { Button } from "@amigo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@amigo/ui/components/dialog";
import { getRecordHistory } from "@/actions/audit";

interface TransferredFromIndicatorProps {
  /** The display name of the original owner (from userDisplayName) */
  originalOwnerName: string;
  /** The record ID for fetching history */
  recordId: string;
  /** The table name for audit log lookup */
  tableName: string;
  /** Whether to show the indicator - should only be shown to record owner */
  show: boolean;
}

interface AuditEntry {
  id: string;
  action: string;
  userName: string | null;
  timestamp: string;
  changes: Record<string, unknown> | null;
}

export function TransferredFromIndicator({
  originalOwnerName,
  recordId,
  tableName,
  show,
}: TransferredFromIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  if (!show) {
    return null;
  }

  const handleOpenHistory = async () => {
    setIsOpen(true);
    setIsLoading(true);

    try {
      const result = await getRecordHistory(recordId, tableName);
      if (result.success && result.history) {
        setHistory(result.history);
      }
    } catch (error) {
      console.error("Failed to fetch record history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpenHistory}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
      >
        <ArrowRightLeft className="h-3 w-3" />
        <span>From {originalOwnerName}</span>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Record History
            </DialogTitle>
            <DialogDescription>
              This record was transferred from {originalOwnerName}.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : history.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No history available.
              </p>
            ) : (
              <div className="space-y-3">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border bg-card p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          entry.action === "INSERT"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : entry.action === "UPDATE"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {entry.action}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {entry.userName && (
                      <p className="mt-1 text-muted-foreground">
                        by {entry.userName}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
