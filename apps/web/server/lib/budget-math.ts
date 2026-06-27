export type BudgetAlertLevel = "ok" | "warn" | "critical" | "over";

export function computePercentUsed(
  currentSpendingHomeCents: number,
  limitHomeCents: number
): number {
  if (limitHomeCents <= 0) return 0;
  return (currentSpendingHomeCents / limitHomeCents) * 100;
}

export function computeRemainingHomeCents(
  limitHomeCents: number,
  currentSpendingHomeCents: number
): number {
  return limitHomeCents - currentSpendingHomeCents;
}

export function budgetAlertLevel(
  percentUsed: number,
  remainingHomeCents: number
): BudgetAlertLevel {
  if (remainingHomeCents < 0 || percentUsed >= 100) return "over";
  if (percentUsed >= 90) return "critical";
  if (percentUsed >= 75) return "warn";
  return "ok";
}

/** Legacy API v1 clamps remaining to zero. */
export function legacyRemainingAmount(remainingHomeCents: number): number {
  return Math.max(0, remainingHomeCents);
}
