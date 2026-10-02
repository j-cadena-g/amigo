import { aiUsageDaily, eq, lt, sql, type DrizzleD1 } from "@amigo/db";

/** Account-wide neuron totals. Not household data, so these queries are not household-scoped. */
const DEFAULT_DAILY_NEURONS = 10_000;

export function dailyNeuronBudget(env: { AI_DAILY_NEURON_BUDGET?: string }): number {
  const budget = Number(env.AI_DAILY_NEURON_BUDGET);
  if (!Number.isFinite(budget) || budget <= 0) return DEFAULT_DAILY_NEURONS;
  return budget;
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Marker row for "Cloudflare refused today's calls (3036)". It holds no neurons. */
const EXHAUSTED = "exhausted";

/** Neurons recorded today, and whether Cloudflare has already refused today's calls. */
export async function usageToday(
  db: DrizzleD1,
  now = new Date()
): Promise<{ neurons: number; blocked: boolean }> {
  const [row] = await db
    .select({
      neurons: sql<number>`coalesce(sum(case when ${aiUsageDaily.feature} = ${EXHAUSTED} then 0 else ${aiUsageDaily.neurons} end), 0)`,
      blocked: sql<number>`coalesce(max(${aiUsageDaily.feature} = ${EXHAUSTED}), 0)`,
    })
    .from(aiUsageDaily)
    .where(eq(aiUsageDaily.day, utcDay(now)));
  return { neurons: Number(row?.neurons ?? 0), blocked: Number(row?.blocked ?? 0) === 1 };
}

export async function neuronsUsedToday(db: DrizzleD1, now = new Date()): Promise<number> {
  return (await usageToday(db, now)).neurons;
}

/** Idempotent: repeated or concurrent 3036 errors leave one marker and no neurons. */
async function markExhausted(db: DrizzleD1, now: Date): Promise<void> {
  await db
    .insert(aiUsageDaily)
    .values({ day: utcDay(now), feature: EXHAUSTED, neurons: 0, updatedAt: now })
    .onConflictDoNothing();
}

export async function recordNeurons(
  db: DrizzleD1,
  feature: string,
  neurons: number,
  now = new Date()
): Promise<void> {
  await db
    .insert(aiUsageDaily)
    .values({
      day: utcDay(now),
      feature,
      neurons,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [aiUsageDaily.day, aiUsageDaily.feature],
      set: {
        neurons: sql`${aiUsageDaily.neurons} + excluded.neurons`,
        updatedAt: now,
      },
    });
}

export type BudgetOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "budget_exhausted" | "error" };

/**
 * Run `run` only if today's recorded neurons plus `estimate` fit the budget,
 * then record what it actually cost. This is a soft cap: calls started side by
 * side all check before any of them records, so a burst can pass the budget by
 * a few calls' worth. That's acceptable for a few dozen neurons per call.
 */
export async function runWithinBudget<T>(
  env: { AI_DAILY_NEURON_BUDGET?: string },
  db: DrizzleD1,
  feature: string,
  estimate: number,
  run: (signal: AbortSignal) => Promise<T>,
  neuronsOf: (result: T) => number | null,
  options?: { signal?: AbortSignal; now?: Date }
): Promise<BudgetOutcome<T>> {
  const now = options?.now ?? new Date();
  const budget = dailyNeuronBudget(env);
  const used = await usageToday(db, now);
  if (used.blocked || used.neurons + estimate > budget) {
    logBudget("budget_exhausted", feature);
    return { ok: false, reason: "budget_exhausted" };
  }

  const controller = new AbortController();
  const parent = options?.signal;
  const onParentAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted) controller.abort(parent.reason);
  else parent?.addEventListener("abort", onParentAbort, { once: true });

  try {
    const value = await run(controller.signal);
    await recordNeurons(db, feature, neuronsOf(value) ?? estimate, now);
    return { ok: true, value };
  } catch (error) {
    if (isAllocationExhausted(error)) {
      // Cloudflare 3036 means today's free allocation is gone for the whole account.
      await markExhausted(db, now);
      logBudget("budget_exhausted", feature);
      return { ok: false, reason: "budget_exhausted" };
    }
    // A call cut off by the deadline is still billed, so count its estimate.
    if (controller.signal.aborted) await recordNeurons(db, feature, estimate, now);
    logBudget("error", feature);
    return { ok: false, reason: "error" };
  } finally {
    parent?.removeEventListener("abort", onParentAbort);
  }
}

export async function pruneAiUsage(db: DrizzleD1, olderThanDays = 30): Promise<void> {
  const cutoff = utcDay(new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000));
  await db.delete(aiUsageDaily).where(lt(aiUsageDaily.day, cutoff));
}

function isAllocationExhausted(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
  const code =
    error && typeof error === "object" && "code" in error && error.code != null
      ? String(error.code)
      : "";
  return message.includes("3036") || code.includes("3036");
}

function logBudget(reason: "budget_exhausted" | "error", feature: string): void {
  console.warn(JSON.stringify({ context: "ai-budget", reason, feature }));
}
