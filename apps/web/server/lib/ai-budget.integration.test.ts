import { aiUsageDaily, and, eq, type DrizzleD1 } from "@amigo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  neuronsUsedToday,
  pruneAiUsage,
  recordNeurons,
  runWithinBudget,
  utcDay,
} from "./ai-budget";
import { createTestDb } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

let serial = 0;

function isolatedNow(): Date {
  serial += 1;
  return new Date(Date.UTC(2090, 0, serial, 12));
}

describe("ai neuron budget", () => {
  let db: DrizzleD1;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = createTestDb(getIntegrationEnv().DB);
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips a call that would pass the daily budget", async () => {
    const now = isolatedNow();
    await recordNeurons(db, "seed", 95, now);
    const run = vi.fn();
    const result = await runWithinBudget(
      { AI_DAILY_NEURON_BUDGET: "100" },
      db,
      "merchant-names",
      10,
      run,
      () => 1,
      { now }
    );
    expect(result).toEqual({ ok: false, reason: "budget_exhausted" });
    expect(run).not.toHaveBeenCalled();
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toEqual({
      context: "ai-budget",
      reason: "budget_exhausted",
      feature: "merchant-names",
    });
  });

  it("counts the estimate for a call cut off by the deadline", async () => {
    const now = isolatedNow();
    const deadline = new AbortController();
    const run = vi.fn(async (signal: AbortSignal) => {
      deadline.abort();
      throw signal.reason ?? new Error("aborted");
    });
    const result = await runWithinBudget(
      { AI_DAILY_NEURON_BUDGET: "100" },
      db,
      "merchant-names",
      12,
      run,
      () => 1,
      { now, signal: deadline.signal }
    );
    expect(result).toEqual({ ok: false, reason: "error" });
    expect(await neuronsUsedToday(db, now)).toBe(12);
  });

  it("counts nothing for a call that fails on its own", async () => {
    const now = isolatedNow();
    const result = await runWithinBudget(
      { AI_DAILY_NEURON_BUDGET: "100" },
      db,
      "merchant-names",
      12,
      async () => {
        throw new Error("upstream");
      },
      () => 1,
      { now }
    );
    expect(result).toEqual({ ok: false, reason: "error" });
    expect(await neuronsUsedToday(db, now)).toBe(0);
  });

  it("still runs when the estimate lands exactly on the budget", async () => {
    const now = isolatedNow();
    await recordNeurons(db, "seed", 90, now);
    const run = vi.fn(async () => ({ usage: { neurons: 4 } }));
    const result = await runWithinBudget(
      { AI_DAILY_NEURON_BUDGET: "100" },
      db,
      "merchant-names",
      10,
      run,
      (value: { usage: { neurons: number } }) => value.usage.neurons,
      { now }
    );
    expect(result.ok).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it("records usage.neurons and falls back to the estimate when usage is missing", async () => {
    const measuredDay = isolatedNow();
    const measured = await runWithinBudget(
      { AI_DAILY_NEURON_BUDGET: "100" },
      db,
      "merchant-names",
      40,
      async () => ({ usage: { neurons: 15.75 } }),
      (value: { usage?: { neurons?: number } }) => value.usage?.neurons ?? null,
      { now: measuredDay }
    );
    expect(measured.ok).toBe(true);
    expect(await featureNeurons(db, "merchant-names", measuredDay)).toBe(15.75);

    const estimatedDay = isolatedNow();
    const estimated = await runWithinBudget(
      { AI_DAILY_NEURON_BUDGET: "100" },
      db,
      "merchant-names",
      13,
      async () => ({ choices: [] }),
      () => null,
      { now: estimatedDay }
    );
    expect(estimated.ok).toBe(true);
    expect(await featureNeurons(db, "merchant-names", estimatedDay)).toBe(13);
  });

  it("blocks the rest of the day after error 3036", async () => {
    const now = isolatedNow();
    const run = vi.fn(async () => {
      throw Object.assign(new Error("allocation"), { code: 3036 });
    });
    const first = await runWithinBudget(
      { AI_DAILY_NEURON_BUDGET: "100" },
      db,
      "merchant-names",
      10,
      run,
      () => 1,
      { now }
    );
    const second = await runWithinBudget(
      { AI_DAILY_NEURON_BUDGET: "100" },
      db,
      "merchant-names",
      10,
      async () => ({ usage: { neurons: 1 } }),
      () => 1,
      { now }
    );
    expect(first).toEqual({ ok: false, reason: "budget_exhausted" });
    expect(second).toEqual({ ok: false, reason: "budget_exhausted" });
    expect(run).toHaveBeenCalledTimes(1);
    expect(await featureNeurons(db, "exhausted", now)).toBe(0);
    expect(await neuronsUsedToday(db, now)).toBe(0);

    const messageDay = isolatedNow();
    const messageOnly = await runWithinBudget(
      { AI_DAILY_NEURON_BUDGET: "80" },
      db,
      "merchant-names",
      10,
      async () => {
        throw new Error("Workers AI error 3036");
      },
      () => 1,
      { now: messageDay }
    );
    expect(messageOnly).toEqual({ ok: false, reason: "budget_exhausted" });
    expect(await featureNeurons(db, "exhausted", messageDay)).toBe(0);
  });

  it("keeps recorded usage when repeated 3036 errors arrive after it", async () => {
    const now = isolatedNow();
    await recordNeurons(db, "merchant-names", 30, now);
    const refuse = async () => {
      throw Object.assign(new Error("allocation"), { code: 3036 });
    };
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        runWithinBudget({ AI_DAILY_NEURON_BUDGET: "100" }, db, "merchant-names", 10, refuse, () => 1, {
          now,
        })
      )
    );
    for (const result of results) expect(result).toEqual({ ok: false, reason: "budget_exhausted" });
    expect(await neuronsUsedToday(db, now)).toBe(30);
    const later = vi.fn();
    expect(
      await runWithinBudget({ AI_DAILY_NEURON_BUDGET: "100" }, db, "merchant-names", 1, later, () => 1, {
        now,
      })
    ).toEqual({ ok: false, reason: "budget_exhausted" });
    expect(later).not.toHaveBeenCalled();
  });

  it("logs other errors without the merchant text and does not record them", async () => {
    const now = isolatedNow();
    const result = await runWithinBudget(
      { AI_DAILY_NEURON_BUDGET: "100" },
      db,
      "merchant-names",
      10,
      async () => {
        throw new Error("failed for RCSS OXFORD");
      },
      () => null,
      { now }
    );
    expect(result).toEqual({ ok: false, reason: "error" });
    const line = String(warn.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({
      context: "ai-budget",
      reason: "error",
      feature: "merchant-names",
    });
    expect(line).not.toContain("RCSS");
    expect(await neuronsUsedToday(db, now)).toBe(0);
  });

  it("counts two concurrent records for the same feature", async () => {
    const now = isolatedNow();
    const feature = `concurrent-${crypto.randomUUID()}`;
    await Promise.all([
      recordNeurons(db, feature, 1.5, now),
      recordNeurons(db, feature, 2.25, now),
    ]);
    expect(await featureNeurons(db, feature, now)).toBeCloseTo(3.75);
  });

  it("removes days older than the retention window only", async () => {
    const feature = crypto.randomUUID();
    const older = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const boundary = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newer = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    await recordNeurons(db, feature, 1, older);
    await recordNeurons(db, feature, 2, boundary);
    await recordNeurons(db, feature, 3, newer);
    await pruneAiUsage(db, 30);
    const left = await db
      .select({ neurons: aiUsageDaily.neurons, day: aiUsageDaily.day })
      .from(aiUsageDaily)
      .where(eq(aiUsageDaily.feature, feature));
    expect(left.map((row) => row.neurons).sort()).toEqual([2, 3]);
    expect(left.map((row) => row.day)).not.toContain(utcDay(older));
  });
});

async function featureNeurons(db: DrizzleD1, feature: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ neurons: aiUsageDaily.neurons })
    .from(aiUsageDaily)
    .where(and(eq(aiUsageDaily.day, utcDay(now)), eq(aiUsageDaily.feature, feature)));
  return row?.neurons ?? 0;
}
