import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
}));

vi.mock("@amigo/db", () => ({
  auditLogs: { table: "audit_logs" },
  eq: (...args: unknown[]) => ({ type: "eq", args }),
  and: (...args: unknown[]) => ({ type: "and", args }),
}));

import {
  diffAuditSnapshots,
  insertManyAuditLogs,
  parseAuditSnapshot,
  snapshotCurrency,
  withAudit,
} from "./audit";

describe("parseAuditSnapshot", () => {
  it("returns objects as-is", () => {
    expect(parseAuditSnapshot({ amount: 6191, currency: "CAD" })).toEqual({
      amount: 6191,
      currency: "CAD",
    });
  });

  it("unwraps double-encoded JSON strings from historical writes", () => {
    const snapshot = { amount: 5500, description: "Tenant insurance" };
    expect(parseAuditSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(parseAuditSnapshot(JSON.stringify(JSON.stringify(snapshot)))).toEqual(
      snapshot
    );
  });

  it("rejects arrays and invalid JSON so character-index diffs cannot form", () => {
    expect(parseAuditSnapshot('{"amount":6191')).toBeNull();
    expect(parseAuditSnapshot(["amount"])).toBeNull();
    expect(parseAuditSnapshot(null)).toBeNull();
  });
});

describe("diffAuditSnapshots", () => {
  it("diffs object fields instead of JSON character indexes", () => {
    expect(
      diffAuditSnapshots(
        JSON.stringify({ amount: 5500, description: "Tenant insurance" }),
        JSON.stringify({ amount: 6191, description: "Tenant insurance" })
      )
    ).toEqual({
      amount: { from: 5500, to: 6191 },
    });
  });

  it("reads currency from encoded snapshots", () => {
    expect(snapshotCurrency(JSON.stringify({ currency: "CAD" }))).toBe("CAD");
  });
});

describe("insertManyAuditLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops on an empty row list", async () => {
    const db = { insert: vi.fn() };
    await insertManyAuditLogs(db as never, []);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserts all rows in a single batch", async () => {
    mocks.insertValues.mockResolvedValueOnce(undefined);
    const db = {
      insert: vi.fn(() => ({
        values: mocks.insertValues,
      })),
    };

    await insertManyAuditLogs(db as never, [
      {
        householdId: "h1",
        tableName: "grocery_items",
        recordId: "a",
        operation: "DELETE",
        oldValues: { id: "a" },
        changedBy: "u1",
      },
      {
        householdId: "h1",
        tableName: "grocery_items",
        recordId: "b",
        operation: "DELETE",
        oldValues: { id: "b" },
        changedBy: "u1",
      },
    ]);

    expect(mocks.insertValues).toHaveBeenCalledWith([
      {
        householdId: "h1",
        tableName: "grocery_items",
        recordId: "a",
        operation: "DELETE",
        oldValues: { id: "a" },
        newValues: null,
        changedBy: "u1",
      },
      {
        householdId: "h1",
        tableName: "grocery_items",
        recordId: "b",
        operation: "DELETE",
        oldValues: { id: "b" },
        newValues: null,
        changedBy: "u1",
      },
    ]);
  });

  it("logs and swallows batch insert failures", async () => {
    const auditError = new Error("D1 unavailable");
    mocks.insertValues.mockRejectedValueOnce(auditError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = {
      insert: vi.fn(() => ({
        values: mocks.insertValues,
      })),
    };

    await insertManyAuditLogs(db as never, [
      {
        householdId: "h1",
        tableName: "grocery_items",
        recordId: "a",
        operation: "DELETE",
        changedBy: "u1",
      },
    ]);

    expect(consoleError).toHaveBeenCalledWith("Batch audit log write failed", {
      error: auditError,
      count: 1,
      householdId: "h1",
      tableName: "grocery_items",
      operation: "DELETE",
      changedBy: "u1",
    });
    consoleError.mockRestore();
  });
});

describe("withAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves the mutation result type for audit callbacks", () => {
    type MutationResult = {
      id: string;
      amount: number;
    };
    type AuditOptions = Parameters<typeof withAudit<MutationResult>>[1];
    type NewValuesCallback = Extract<
      NonNullable<AuditOptions["newValues"]>,
      (...args: never[]) => unknown
    >;

    expectTypeOf<Parameters<NewValuesCallback>[0]>().toEqualTypeOf<MutationResult>();
  });

  it("logs structured context and returns the committed mutation result when audit writes fail", async () => {
    const auditError = new Error("D1 unavailable");
    mocks.insertValues.mockRejectedValueOnce(auditError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = {
      insert: vi.fn(() => ({
        values: mocks.insertValues,
      })),
    };

    await expect(
      withAudit(
        db as never,
        {
          householdId: "house-1",
          tableName: "transactions",
          recordId: "txn-1",
          operation: "DELETE",
          changedBy: "user-1",
        },
        async () => ({ id: "txn-1" })
      )
    ).resolves.toEqual({ id: "txn-1" });

    expect(consoleError).toHaveBeenCalledWith("Audit log write failed", {
      error: auditError,
      householdId: "house-1",
      tableName: "transactions",
      recordId: "txn-1",
      operation: "DELETE",
      changedBy: "user-1",
    });

    consoleError.mockRestore();
  });

  it("passes snapshot objects through so Drizzle json mode stringifies once", async () => {
    mocks.insertValues.mockResolvedValueOnce(undefined);
    const db = {
      insert: vi.fn(() => ({
        values: mocks.insertValues,
      })),
    };
    const existing = { id: "txn-1", amount: 5500 };
    const updated = { id: "txn-1", amount: 6191 };

    await withAudit(
      db as never,
      {
        householdId: "house-1",
        tableName: "transactions",
        recordId: "txn-1",
        operation: "UPDATE",
        oldValues: existing,
        newValues: (result) => result,
        changedBy: "user-1",
      },
      async () => updated
    );

    expect(mocks.insertValues).toHaveBeenCalledWith({
      householdId: "house-1",
      tableName: "transactions",
      recordId: "txn-1",
      operation: "UPDATE",
      oldValues: existing,
      newValues: updated,
      changedBy: "user-1",
    });
  });
});
