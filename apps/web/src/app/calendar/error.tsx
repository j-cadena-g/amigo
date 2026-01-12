"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-fallback";

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Calendar error:", error);
  }, [error]);

  return <ErrorFallback error={error} reset={reset} />;
}
