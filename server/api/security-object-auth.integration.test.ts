import {
  and,
  assets,
  auditLogs,
  budgets,
  debts,
  eq,
  financialAccounts,
  groceryItemTags,
  groceryTags,
  isNull,
  transactions,
  users,
  type DrizzleD1,
} from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAccountsRequest } from "./accounts";
import { handleAssetsRequest } from "./assets";
import { handleAuditRequest } from "./audit";
import { handleBudgetsRequest } from "./budgets";
import { handleDebtsRequest } from "./debts";
import { handleSyncRequest } from "./sync";
import { handleTransactionsRequest } from "./transactions";
import { createTestDb, seedHouseholdWithOwner } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import type { AppSession } from "../env";

function sessionFor(options: {
  userId: string;
  householdId: string;
  role?: AppSession["role"];
  orgId?: string;
}): AppSession {
  return {
    userId: options.userId,
    householdId: options.householdId,
    orgId: options.orgId ?? "org-security-object-auth",
    role: options.role ?? "member",
    email: `${options.userId}@example.com`,
    name: options.userId,
  };
}

async function seedMember(
  db: DrizzleD1,
  options: {
    id: string;
    authId: string;
    householdId: string;
    role?: AppSession["role"];
  }
) {
  await db.insert(users).values({
    id: options.id,
    authId: options.authId,
    email: `${options.id}@example.com`,
    householdId: options.householdId,
    role: options.role ?? "member",
  });
}

describe("security object authorization integration", () => {
  let householdId: string;
  let orgId: string;
  let ownerId: string;
  let adminId: string;
  let memberOneId: string;
  let memberTwoId: string;
  let otherHouseholdId: string;
  let db: DrizzleD1;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-object-${suffix}`;
    orgId = `org_object_${suffix}`;
    ownerId = `user-object-owner-${suffix}`;
    adminId = `user-object-admin-${suffix}`;
    memberOneId = `user-object-member-one-${suffix}`;
    memberTwoId = `user-object-member-two-${suffix}`;
    otherHouseholdId = `hh-object-other-${suffix}`;

    db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      clerkOrgId: orgId,
      ownerId,
      ownerAuthId: `clerk_object_owner_${suffix}`,
    });
    await seedMember(db, {
      id: adminId,
      authId: `clerk_object_admin_${suffix}`,
      householdId,
      role: "admin",
    });
    await seedMember(db, {
      id: memberOneId,
      authId: `clerk_object_member_one_${suffix}`,
      householdId,
    });
    await seedMember(db, {
      id: memberTwoId,
      authId: `clerk_object_member_two_${suffix}`,
      householdId,
    });
    await seedHouseholdWithOwner(db, {
      householdId: otherHouseholdId,
      clerkOrgId: `org_object_other_${suffix}`,
      ownerId: `user-object-other-owner-${suffix}`,
      ownerAuthId: `clerk_object_other_owner_${suffix}`,
    });
  });

  it("rejects offline sync add mutations that attach tags from another household", async () => {
    const foreignTagId = `tag-foreign-${crypto.randomUUID()}`;
    await db.insert(groceryTags).values({
      id: foreignTagId,
      householdId: otherHouseholdId,
      name: "Foreign",
      color: "red",
    });

    const response = await handleSyncRequest({
      env: getIntegrationEnv(),
      params: {},
      request: new Request("http://localhost/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mutations: [
            {
              id: "mutation-1",
              operation: "add",
              entityType: "groceryItem",
              entityId: `item-${crypto.randomUUID()}`,
              payload: { name: "Milk", tagIds: [foreignTagId] },
            },
          ],
        }),
      }),
      sessionStatus: "authenticated",
      session: sessionFor({ userId: memberOneId, householdId }),
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      processed: 0,
      failed: 1,
      results: [
        {
          success: false,
          error: "One or more tags are invalid for this household",
        },
      ],
    });

    const joined = await db
      .select()
      .from(groceryItemTags)
      .where(eq(groceryItemTags.tagId, foreignTagId));
    expect(joined).toHaveLength(0);
  });

  it("rejects transaction account references to another member's personal account", async () => {
    const accountId = crypto.randomUUID();
    await db.insert(financialAccounts).values({
      id: accountId,
      householdId,
      userId: memberTwoId,
      name: "Private account",
      type: "CHECKING",
      balance: 0,
      currency: "CAD",
    });

    await expect(
      handleTransactionsRequest({
        env: getIntegrationEnv(),
        params: {},
        request: new Request("http://localhost/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: 12.34,
            category: "groceries",
            type: "expense",
            date: "2026-06-17",
            accountId,
          }),
        }),
        sessionStatus: "authenticated",
        session: sessionFor({ userId: memberOneId, householdId }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Unknown or inaccessible account",
    });
  });

  it("denies audit history for a private transaction the viewer can not read", async () => {
    const transactionId = `tx-private-${crypto.randomUUID()}`;
    await db.insert(transactions).values({
      id: transactionId,
      householdId,
      userId: memberTwoId,
      amount: 1200,
      currency: "CAD",
      category: "private",
      description: "private",
      type: "expense",
      date: "2026-06-17",
    });
    await db.insert(auditLogs).values({
      householdId,
      tableName: "transactions",
      recordId: transactionId,
      operation: "UPDATE",
      oldValues: JSON.stringify({ description: "old private value" }),
      newValues: JSON.stringify({ description: "new private value" }),
      changedBy: memberTwoId,
    });

    await expect(
      handleAuditRequest({
        env: getIntegrationEnv(),
        params: { "*": transactionId },
        request: new Request(
          `http://localhost/api/audit/${transactionId}?table=transactions`,
          { method: "GET" }
        ),
        sessionStatus: "authenticated",
        session: sessionFor({ userId: memberOneId, householdId }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Audit record not found",
    });
  });

  it("denies shared-budget-visible transaction updates and deletes by non-owner members", async () => {
    const budgetId = crypto.randomUUID();
    const transactionId = crypto.randomUUID();
    await db.insert(budgets).values({
      id: budgetId,
      householdId,
      userId: null,
      name: "Shared",
      category: "groceries",
      limitAmount: 10000,
      limitAmountHome: 10000,
      currency: "CAD",
      period: "monthly",
    });
    await db.insert(transactions).values({
      id: transactionId,
      householdId,
      userId: memberTwoId,
      budgetId,
      amount: 1200,
      currency: "CAD",
      category: "groceries",
      description: "shared visible",
      type: "expense",
      date: "2026-06-17",
    });

    await expect(
      handleTransactionsRequest({
        env: getIntegrationEnv(),
        params: { "*": transactionId },
        request: new Request(`http://localhost/api/transactions/${transactionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: "tampered" }),
        }),
        sessionStatus: "authenticated",
        session: sessionFor({ userId: memberOneId, householdId }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Cannot modify another user's transaction",
    });

    await expect(
      handleTransactionsRequest({
        env: getIntegrationEnv(),
        params: { "*": transactionId },
        request: new Request(`http://localhost/api/transactions/${transactionId}`, {
          method: "DELETE",
        }),
        sessionStatus: "authenticated",
        session: sessionFor({ userId: memberOneId, householdId }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Cannot delete another user's transaction",
    });
  });

  it("denies admin writes to another member's private transaction", async () => {
    const transactionId = crypto.randomUUID();
    await db.insert(transactions).values({
      id: transactionId,
      householdId,
      userId: memberTwoId,
      amount: 1200,
      currency: "CAD",
      category: "private",
      description: "private",
      type: "expense",
      date: "2026-06-17",
    });

    await expect(
      handleTransactionsRequest({
        env: getIntegrationEnv(),
        params: { "*": transactionId },
        request: new Request(`http://localhost/api/transactions/${transactionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: "admin tampered" }),
        }),
        sessionStatus: "authenticated",
        session: sessionFor({ userId: adminId, householdId, role: "admin" }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Transaction not found",
    });

    await expect(
      handleTransactionsRequest({
        env: getIntegrationEnv(),
        params: { "*": transactionId },
        request: new Request(`http://localhost/api/transactions/${transactionId}`, {
          method: "DELETE",
        }),
        sessionStatus: "authenticated",
        session: sessionFor({ userId: adminId, householdId, role: "admin" }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Transaction not found",
    });
  });

  it("preserves shared ownership when PATCHing a shared debt without isShared", async () => {
    const debtId = crypto.randomUUID();
    await db.insert(debts).values({
      id: debtId,
      householdId,
      userId: null,
      name: "Shared debt",
      type: "LOAN",
      balanceInitial: 100000,
      balanceCurrent: 1000,
      currency: "CAD",
    });

    const response = await handleDebtsRequest({
      env: getIntegrationEnv(),
      params: { "*": debtId },
      request: new Request(`http://localhost/api/debts/${debtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Shared debt updated",
          type: "LOAN",
          loanAmount: 1000,
          totalPaid: 10,
        }),
      }),
      sessionStatus: "authenticated",
      session: sessionFor({ userId: adminId, householdId, role: "admin" }),
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    const updated = await db
      .select({ userId: debts.userId })
      .from(debts)
      .where(eq(debts.id, debtId))
      .get();
    expect(updated?.userId).toBeNull();
  });

  it.each([
    {
      name: "account",
      seed: async (id: string) =>
        db.insert(financialAccounts).values({
          id,
          householdId,
          userId: memberOneId,
          name: "Private account",
          type: "CHECKING",
          balance: 1000,
          currency: "CAD",
        }),
      request: (id: string) =>
        handleAccountsRequest({
          env: getIntegrationEnv(),
          params: { "*": id },
          request: new Request(`http://localhost/api/accounts/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Taken account",
              type: "CHECKING",
              balance: 10,
              isShared: true,
            }),
          }),
          sessionStatus: "authenticated",
          session: sessionFor({ userId: adminId, householdId, role: "admin" }),
          loadContext: {} as never,
        }),
    },
    {
      name: "asset",
      seed: async (id: string) =>
        db.insert(assets).values({
          id,
          householdId,
          userId: memberOneId,
          name: "Private asset",
          type: "CASH",
          balance: 1000,
          currency: "CAD",
        }),
      request: (id: string) =>
        handleAssetsRequest({
          env: getIntegrationEnv(),
          params: { "*": id },
          request: new Request(`http://localhost/api/assets/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Taken asset",
              type: "CASH",
              balance: 10,
              isShared: true,
            }),
          }),
          sessionStatus: "authenticated",
          session: sessionFor({ userId: adminId, householdId, role: "admin" }),
          loadContext: {} as never,
        }),
    },
    {
      name: "debt",
      seed: async (id: string) =>
        db.insert(debts).values({
          id,
          householdId,
          userId: memberOneId,
          name: "Private debt",
          type: "LOAN",
          balanceInitial: 100000,
          balanceCurrent: 1000,
          currency: "CAD",
        }),
      request: (id: string) =>
        handleDebtsRequest({
          env: getIntegrationEnv(),
          params: { "*": id },
          request: new Request(`http://localhost/api/debts/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Taken debt",
              type: "LOAN",
              loanAmount: 1000,
              totalPaid: 10,
              isShared: true,
            }),
          }),
          sessionStatus: "authenticated",
          session: sessionFor({ userId: adminId, householdId, role: "admin" }),
          loadContext: {} as never,
        }),
    },
    {
      name: "budget",
      seed: async (id: string) =>
        db.insert(budgets).values({
          id,
          householdId,
          userId: memberOneId,
          name: "Private budget",
          category: "private",
          limitAmount: 100000,
          limitAmountHome: 100000,
          currency: "CAD",
          period: "monthly",
        }),
      request: (id: string) =>
        handleBudgetsRequest({
          env: getIntegrationEnv(),
          params: { "*": id },
          request: new Request(`http://localhost/api/budgets/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Taken budget",
              category: "private",
              limitAmount: 1000,
              period: "monthly",
              isShared: true,
            }),
          }),
          sessionStatus: "authenticated",
          session: sessionFor({ userId: adminId, householdId, role: "admin" }),
          loadContext: {} as never,
        }),
    },
  ])("requires explicit adminTakeover for personal $name promotion", async (entry) => {
    const id = `${entry.name}-${crypto.randomUUID()}`;
    await entry.seed(id);

    await expect(entry.request(id)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Explicit admin takeover is required to share another user's personal financial object",
    });
  });

  it("allows explicit audited admin takeover of another member's personal asset", async () => {
    const assetId = `asset-takeover-${crypto.randomUUID()}`;
    await db.insert(assets).values({
      id: assetId,
      householdId,
      userId: memberOneId,
      name: "Private asset",
      type: "CASH",
      balance: 1000,
      currency: "CAD",
    });

    const response = await handleAssetsRequest({
      env: getIntegrationEnv(),
      params: { "*": assetId },
      request: new Request(`http://localhost/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Shared asset",
          type: "CASH",
          balance: 10,
          isShared: true,
          adminTakeover: true,
        }),
      }),
      sessionStatus: "authenticated",
      session: sessionFor({ userId: adminId, householdId, role: "admin" }),
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    const updated = await db
      .select({ userId: assets.userId })
      .from(assets)
      .where(eq(assets.id, assetId))
      .get();
    expect(updated?.userId).toBeNull();

    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.householdId, householdId),
          eq(auditLogs.tableName, "assets"),
          eq(auditLogs.recordId, assetId),
          isNull(auditLogs.oldValues)
        )
      );
    expect(audit).toHaveLength(0);

    const updateAudit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.householdId, householdId),
          eq(auditLogs.tableName, "assets"),
          eq(auditLogs.recordId, assetId)
        )
      );
    expect(updateAudit).toHaveLength(1);
  });
});
