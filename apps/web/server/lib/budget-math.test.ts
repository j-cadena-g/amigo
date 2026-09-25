import { describe, expect, it } from "vitest";
import { budgetAlertLevel } from "./budget-math";

describe("budgetAlertLevel", () => {
  it("treats spending at the limit as critical, not over", () => {
    expect(budgetAlertLevel(100, 0)).toBe("critical");
  });

  it("treats spending past the limit as over", () => {
    expect(budgetAlertLevel(100.1, -1)).toBe("over");
  });

  it("uses the 75% and 90% near-limit bands", () => {
    expect(budgetAlertLevel(74.9, 251)).toBe("ok");
    expect(budgetAlertLevel(75, 250)).toBe("warn");
    expect(budgetAlertLevel(90, 100)).toBe("critical");
  });
});
