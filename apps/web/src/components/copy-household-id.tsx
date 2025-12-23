"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyHouseholdIdProps {
  householdId: string;
}

export function CopyHouseholdId({ householdId }: CopyHouseholdIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(householdId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy to clipboard");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="font-mono text-sm text-muted-foreground break-all">
        {householdId}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
        aria-label={copied ? "Copied" : "Copy household ID"}
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
