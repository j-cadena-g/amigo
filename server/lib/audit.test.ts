import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
}));

vi.mock("@amigo/db", () => ({
  auditLogs: { table: "audit_logs" },
  eq: (...args: unknown[]) => ({ type: "eq", args }),
  and: (...args: unknown[]) => ({ type: "and", args }),
}));

import { insertManyAuditLogs, withAudit } from "./audit";

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
        oldValues: JSON.stringify({ id: "a" }),
        newValues: null,
        changedBy: "u1",
      },
      {
        householdId: "h1",
        tableName: "grocery_items",
        recordId: "b",
        operation: "DELETE",
        oldValues: JSON.stringify({ id: "b" }),
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
  });
});
