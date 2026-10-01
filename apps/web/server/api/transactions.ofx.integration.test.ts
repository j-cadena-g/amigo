import {
  and,
  eq,
  financialAccounts,
  scopeToHousehold,
  transactions,
} from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleTransactionsRequest } from "./transactions";
import {
  createTestDb,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import { csvStatement, csvRow } from "../test/wealthsimple-fixture";
import { statement, transaction } from "../test/ofx-fixture";

describe("OFX imports", () => {
  let householdId: string;
  let ownerId: string;
  let accountId: string;
  beforeEach(async () => {
    householdId = crypto.randomUUID();
    ownerId = crypto.randomUUID();
    accountId = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: crypto.randomUUID(),
    });
    await db.insert(financialAccounts).values({
      id: accountId,
      householdId,
      userId: ownerId,
      name: "Test card",
      type: "CREDIT",
      balance: 0,
      currency: "CAD",
    });
  });
  const call = (extra: Record<string, unknown> = {}) =>
    handleTransactionsRequest({
      env: getIntegrationEnv(),
      params: { "*": "import" },
      request: new Request("http://localhost/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ofx: statement(),
          accountId,
          dryRun: true,
          ...extra,
        }),
      }),
      session: testSession({ userId: ownerId, householdId }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
  const stored = () =>
    createTestDb(getIntegrationEnv().DB)
      .select()
      .from(transactions)
      .where(scopeToHousehold(transactions.householdId, householdId));

  it("previews without writing, saves exact cents, and skips repeat imports", async () => {
    const preview = (await (await call()).json()) as {
      rows: { amountCents: number; duplicate: boolean }[];
    };
    expect(preview.rows[0]).toMatchObject({
      amountCents: 1234,
      duplicate: false,
    });
    expect(await stored()).toHaveLength(0);
    expect(await (await call({ dryRun: false })).json()).toMatchObject({
      inserted: 1,
      skipped: 0,
    });
    expect((await stored())[0]).toMatchObject({
      amount: 1234,
      accountId,
      reviewed: false,
    });
    expect(await (await call()).json()).toMatchObject({
      rows: [expect.objectContaining({ duplicate: true })],
    });
    expect(await (await call({ dryRun: false })).json()).toMatchObject({
      inserted: 0,
      skipped: 1,
    });
  });
  it("honors exclusions and detects duplicates within a file", async () => {
    const ofx = statement(
      transaction() + transaction() + transaction("credit", "100.00")
    );
    const preview = (await (await call({ ofx })).json()) as {
      rows: { externalId: string; duplicate: boolean }[];
    };
    expect(preview.rows.map((row) => row.duplicate)).toEqual([
      false,
      true,
      false,
    ]);
    expect(
      await (
        await call({
          ofx,
          dryRun: false,
          excludedIds: [preview.rows[2]!.externalId],
        })
      ).json()
    ).toMatchObject({ inserted: 1, skipped: 1 });
    expect(await stored()).toHaveLength(1);
  });
  it("keeps deleted import identities deduplicated", async () => {
    await call({ dryRun: false });
    const db = createTestDb(getIntegrationEnv().DB);
    await db
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(scopeToHousehold(transactions.householdId, householdId));
    expect(await (await call()).json()).toMatchObject({
      rows: [expect.objectContaining({ duplicate: true })],
    });
  });
  it("does not re-import a transaction deleted through the API", async () => {
    await call({ dryRun: false });
    const [row] = await stored();
    const response = await handleTransactionsRequest({
      env: getIntegrationEnv(),
      params: { "*": row!.id },
      request: new Request(`http://localhost/api/transactions/${row!.id}`, {
        method: "DELETE",
      }),
      session: testSession({ userId: ownerId, householdId }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
    expect(response.ok).toBe(true);
    expect(await (await call({ dryRun: false })).json()).toMatchObject({
      inserted: 0,
      skipped: 1,
    });
    expect(await stored()).toEqual([
      expect.objectContaining({ id: row!.id, deletedAt: expect.any(Date) }),
    ]);
  });
  it("rejects inaccessible, archived, and deleted destination accounts", async () => {
    await expect(call({ accountId: crypto.randomUUID() })).rejects.toThrow(
      "inaccessible"
    );
    const db = createTestDb(getIntegrationEnv().DB);
    const where = and(
      scopeToHousehold(financialAccounts.householdId, householdId),
      eq(financialAccounts.id, accountId)
    );
    await db.update(financialAccounts).set({ archived: true }).where(where);
    await expect(call()).rejects.toThrow("inaccessible");
    await db
      .update(financialAccounts)
      .set({ archived: false, deletedAt: new Date() })
      .where(where);
    await expect(call()).rejects.toThrow("inaccessible");
  });
  it("imports the 2,000-row limit in D1-safe batches", async () => {
    const ofx = statement(
      Array.from({ length: 2000 }, (_, i) => transaction(`large-${i}`)).join("")
    );
    expect(await (await call({ ofx, dryRun: false })).json()).toMatchObject({
      inserted: 2000,
      skipped: 0,
    });
    const preview = (await (await call({ ofx })).json()) as {
      rows: { duplicate: boolean }[];
    };
    expect(preview.rows).toHaveLength(2000);
    expect(preview.rows.every((row) => row.duplicate)).toBe(true);
  });

  it("previews QFX without bank identity and keeps its declared USD currency", async () => {
    const ofx = statement()
      .replace(/<FI>[\s\S]*?<\/FI>/, "")
      .replace("<CURDEF>CAD", "<CURDEF>USD");
    await expect(call({ ofx })).rejects.toThrow("source bank");
    expect(await (await call({ ofx, sourceBank: "rbc" })).json()).toMatchObject(
      {
        rows: [expect.objectContaining({ currency: "USD", amountCents: 1234 })],
      }
    );
  });

  it("marks CSV matches as possible duplicates and makes confirmed retries idempotent", async () => {
    const input = { ofx: undefined, csv: csvStatement() };
    expect(
      await (await call({ ...input, dryRun: false })).json()
    ).toMatchObject({ inserted: 1 });
    const preview = (await (await call(input)).json()) as {
      rows: { externalId: string; possibleDuplicate: boolean }[];
    };
    expect(preview.rows[0]!.possibleDuplicate).toBe(true);
    expect(
      await (await call({ ...input, dryRun: false })).json()
    ).toMatchObject({ inserted: 0, skipped: 1 });
    const confirmation = {
      ...input,
      dryRun: false,
      confirmedDuplicateIds: [preview.rows[0]!.externalId],
      duplicateConfirmationId: crypto.randomUUID(),
    };
    expect(await (await call(confirmation)).json()).toMatchObject({
      inserted: 1,
    });
    expect(await (await call(confirmation)).json()).toMatchObject({
      inserted: 0,
    });
    expect(await stored()).toHaveLength(2);
  });

  it("keeps CSV transfers unchecked, honors exclusions, and never inserts zero amounts", async () => {
    const input = {
      ofx: undefined,
      csv: csvStatement(
        csvRow(),
        csvRow({ activity_sub_type: "TRANSFER", net_cash_amount: "-20" }),
        csvRow({ net_cash_amount: "0" })
      ),
    };
    const preview = (await (await call(input)).json()) as {
      rows: { externalId: string; defaultExcluded: boolean }[];
    };
    expect(preview.rows[1]!.defaultExcluded).toBe(true);
    expect(
      await (
        await call({
          ...input,
          dryRun: false,
          excludedIds: [preview.rows[1]!.externalId],
        })
      ).json()
    ).toMatchObject({ inserted: 1 });
    expect((await stored())[0]!.amount).toBe(1234);
  });

  it("requires acknowledgement for a mismatched currency and allows a label-only override", async () => {
    const ofx = statement().replace("<CURDEF>CAD", "<CURDEF>USD");
    expect(await (await call({ ofx })).json()).toMatchObject({
      currencyMismatch: true,
      accountCurrency: "CAD",
      sourceCurrencies: ["USD"],
    });
    await expect(call({ ofx, dryRun: false })).rejects.toThrow(
      "Confirm the currency"
    );
    expect(await stored()).toHaveLength(0);
    await call({ ofx, currencyOverride: "CAD", dryRun: false });
    expect((await stored())[0]).toMatchObject({
      amount: 1234,
      currency: "CAD",
      exchangeRateToHome: null,
    });
    expect(
      await (await call({ ofx, currencyOverride: "CAD" })).json()
    ).toMatchObject({
      currencyMismatch: false,
      rows: [expect.objectContaining({ duplicate: true, currency: "CAD" })],
    });
  });

  it("corrects an existing import without changing its amount or creating another transaction", async () => {
    const ofx = statement().replace("<CURDEF>CAD", "<CURDEF>USD");
    await call({ ofx, currencyOverride: "CAD", dryRun: false });
    const original = (await stored())[0]!;
    // Reproduce the earlier importer trusting a faulty USD file label.
    await createTestDb(getIntegrationEnv().DB)
      .update(transactions)
      .set({
        currency: "USD",
        exchangeRateToHome: 1.4,
        description: "Edited description",
      })
      .where(
        and(
          scopeToHousehold(transactions.householdId, householdId),
          eq(transactions.id, original.id)
        )
      );
    const input = { ofx, currencyOverride: "CAD", repairCurrency: true };
    expect(await (await call(input)).json()).toMatchObject({
      rows: [expect.objectContaining({ canCorrect: true })],
    });
    expect(
      await (await call({ ...input, dryRun: false })).json()
    ).toMatchObject({ corrected: 1 });
    const after = await stored();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: original.id,
      amount: 1234,
      currency: "CAD",
      exchangeRateToHome: null,
      description: "Edited description",
      categoryId: original.categoryId,
    });
    expect(
      await (await call({ ...input, dryRun: false })).json()
    ).toMatchObject({ corrected: 0 });
  });

  it("corrects every row at the 2,000-row limit", async () => {
    const ofx = statement(
      Array.from({ length: 2000 }, (_, i) => transaction(`large-${i}`)).join("")
    ).replace("<CURDEF>CAD", "<CURDEF>USD");
    await call({ ofx, currencyOverride: "CAD", dryRun: false });
    await createTestDb(getIntegrationEnv().DB)
      .update(transactions)
      .set({ currency: "USD" })
      .where(scopeToHousehold(transactions.householdId, householdId));
    expect(
      await (
        await call({
          ofx,
          currencyOverride: "CAD",
          repairCurrency: true,
          dryRun: false,
        })
      ).json()
    ).toMatchObject({ corrected: 2000 });
    const after = await stored();
    expect(after).toHaveLength(2000);
    expect(after.every((row) => row.currency === "CAD")).toBe(true);
  });

  it("does not correct edited amounts, deleted rows, or imports in another account", async () => {
    const ofx = statement().replace("<CURDEF>CAD", "<CURDEF>USD");
    await call({ ofx, currencyOverride: "CAD", dryRun: false });
    const original = (await stored())[0]!;
    const db = createTestDb(getIntegrationEnv().DB);
    const where = and(
      scopeToHousehold(transactions.householdId, householdId),
      eq(transactions.id, original.id)
    );
    const input = {
      ofx,
      currencyOverride: "CAD",
      repairCurrency: true,
      dryRun: false,
    };
    await db
      .update(transactions)
      .set({ currency: "USD", amount: 9999 })
      .where(where);
    expect(await (await call(input)).json()).toMatchObject({ corrected: 0 });
    await db
      .update(transactions)
      .set({ amount: 1234, deletedAt: new Date() })
      .where(where);
    expect(await (await call(input)).json()).toMatchObject({ corrected: 0 });
    await db
      .update(transactions)
      .set({ deletedAt: null, accountId: null })
      .where(where);
    expect(await (await call(input)).json()).toMatchObject({ corrected: 0 });
    await db.update(transactions).set({ accountId, userId: null }).where(where);
    expect(await (await call(input)).json()).toMatchObject({ corrected: 0 });
    await db
      .update(transactions)
      .set({ userId: ownerId, chargedAmount: 1000, chargedCurrency: "CAD" })
      .where(where);
    expect(await (await call(input)).json()).toMatchObject({ corrected: 0 });
    expect((await stored())[0]!.currency).toBe("USD");
  });

  it("rejects malformed files before writing", async () => {
    await expect(call({ ofx: "not OFX", dryRun: false })).rejects.toThrow(
      "Invalid"
    );
    expect(await stored()).toHaveLength(0);
  });
});
