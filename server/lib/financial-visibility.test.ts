import { describe, expect, it } from "vitest";
import { isSQLWrapper } from "drizzle-orm";
import { CasingCache } from "drizzle-orm/casing";
import { visibleFinancialTransactionsCondition } from "@amigo/db";

const casing = new CasingCache(undefined);

function visibilityWhereSql(viewerUserId: string) {
  const wrapper = visibleFinancialTransactionsCondition(viewerUserId);
  if (!isSQLWrapper(wrapper)) {
    throw new Error("expected SQL wrapper");
  }
  const sqlObj = wrapper.getSQL();
  return sqlObj.toQuery({
    casing,
    escapeName: (name: string) => `"${name.replace(/"/g, '""')}"`,
    escapeParam: () => "?",
    escapeString: (str: string) => `'${String(str).replace(/'/g, "''")}'`,
    inlineParams: true,
    paramStartIndex: { value: 0 },
  });
}

describe("financial-visibility", () => {
  it.each([
    ["user-123", "user-123"],
    ["user_456", "user_456"],
    ["org|abc", "org|abc"],
  ])("visibleFinancialTransactionsCondition embeds viewer id %j", (viewerId, expectedInSql) => {
    const { sql, params } = visibilityWhereSql(viewerId);
    expect(sql).toContain("transactions");
    expect(sql.toLowerCase()).toContain("exists");
    expect(sql.toLowerCase()).toContain("deleted_at");
    expect(sql).toContain(expectedInSql);
    expect(params).toEqual([]);
  });

  it("visibleFinancialTransactionsCondition handles empty viewer id", () => {
    const { sql, params } = visibilityWhereSql("");
    expect(sql.toLowerCase()).toContain("exists");
    expect(sql).toMatch(/user_id"\s*=\s*''/);
    expect(params).toEqual([]);
  });

  it("differs by viewer so conditions are not identical", () => {
    const a = visibilityWhereSql("a").sql;
    const b = visibilityWhereSql("b").sql;
    expect(a).not.toBe(b);
  });
});
