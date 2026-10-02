import { describe, expect, it } from "vitest";
import { dailyNeuronBudget } from "./ai-budget";

describe("dailyNeuronBudget", () => {
  it("uses a positive finite budget", () => {
    expect(dailyNeuronBudget({ AI_DAILY_NEURON_BUDGET: "2500" })).toBe(2500);
    expect(dailyNeuronBudget({ AI_DAILY_NEURON_BUDGET: "0.5" })).toBe(0.5);
  });

  it("falls back to 10000 when the budget is missing, not finite, or not positive", () => {
    expect(dailyNeuronBudget({})).toBe(10_000);
    expect(dailyNeuronBudget({ AI_DAILY_NEURON_BUDGET: undefined })).toBe(10_000);
    expect(dailyNeuronBudget({ AI_DAILY_NEURON_BUDGET: "" })).toBe(10_000);
    expect(dailyNeuronBudget({ AI_DAILY_NEURON_BUDGET: "0" })).toBe(10_000);
    expect(dailyNeuronBudget({ AI_DAILY_NEURON_BUDGET: "-3" })).toBe(10_000);
    expect(dailyNeuronBudget({ AI_DAILY_NEURON_BUDGET: "nope" })).toBe(10_000);
    expect(dailyNeuronBudget({ AI_DAILY_NEURON_BUDGET: "Infinity" })).toBe(10_000);
    expect(dailyNeuronBudget({ AI_DAILY_NEURON_BUDGET: "NaN" })).toBe(10_000);
  });
});
