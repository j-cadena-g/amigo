import {
  and,
  eq,
  financialAccounts,
  financialCategories,
  merchantAliases,
  scopeToHousehold,
  transactions,
} from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanBankDescription } from "../lib/bank-description";
import { handleTransactionsRequest } from "./transactions";
import {
  createTestDb,
  seedFinancialCategory,
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
  const call = (
    extra: Record<string, unknown> = {},
    headers?: Record<string, string>
  ) =>
    handleTransactionsRequest({
      env: getIntegrationEnv(),
      params: { "*": "import" },
      request: new Request("http://localhost/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
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
  const aliases = () =>
    createTestDb(getIntegrationEnv().DB)
      .select()
      .from(merchantAliases)
      .where(scopeToHousehold(merchantAliases.householdId, householdId));

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
  it("rejects expenses into a loan account and accepts its payments", async () => {
    await createTestDb(getIntegrationEnv().DB)
      .update(financialAccounts)
      .set({ type: "LOAN" })
      .where(
        and(
          scopeToHousehold(financialAccounts.householdId, householdId),
          eq(financialAccounts.id, accountId)
        )
      );
    await expect(call()).rejects.toThrow("Expenses can only use");
    await expect(call({ dryRun: false })).rejects.toThrow("Expenses can only use");
    expect(await stored()).toHaveLength(0);

    const payment = statement(transaction("payment-1", "250.00"));
    expect(await (await call({ ofx: payment, dryRun: false })).json()).toMatchObject({
      inserted: 1,
    });
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
      rows: [
        expect.objectContaining({
          canCorrect: true,
          description: "Café & market",
          bankDescription: "Café & market",
        }),
      ],
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

  it("stores a cleaned OFX name, keeps the raw text, and applies one description override", async () => {
    const walmart = "WAL-MART # 3050        LONDON        ON";
    const burger = "BURGER BURGER          LONDON        ON";
    const ofx = statement(
      named(walmart, "walmart", "-10.00") + named(burger, "burger", "-8.50")
    );
    const preview = (await (await call({ ofx })).json()) as {
      rows: { externalId: string; description: string; bankDescription: string }[];
    };
    expect(preview.rows).toEqual([
      expect.objectContaining({
        description: "Wal-Mart",
        bankDescription: walmart,
      }),
      expect.objectContaining({
        description: "Burger Burger",
        bankDescription: burger,
      }),
    ]);
    expect(
      await (
        await call({
          ofx,
          dryRun: false,
          descriptions: {
            [preview.rows[0]!.externalId]: "  My Walmart  ",
            "not-in-the-file": "Ignored",
          },
        })
      ).json()
    ).toMatchObject({ inserted: 2, skipped: 0 });
    expect(await stored()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "My Walmart",
          bankDescription: walmart,
          amount: 1000,
        }),
        expect.objectContaining({
          description: "Burger Burger",
          bankDescription: burger,
          amount: 850,
        }),
      ])
    );
    const list = await handleTransactionsRequest({
      env: getIntegrationEnv(),
      params: { "*": "" },
      request: new Request("http://localhost/api/transactions"),
      session: testSession({ userId: ownerId, householdId }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });
    expect(await list.json()).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ bankDescription: walmart }),
        expect.objectContaining({ bankDescription: burger }),
      ]),
    });
  });

  it("rejects an empty description override", async () => {
    const ofx = statement(named("WAL-MART # 3050        LONDON        ON", "walmart"));
    const preview = (await (await call({ ofx })).json()) as {
      rows: { externalId: string }[];
    };
    await expect(
      call({
        ofx,
        dryRun: false,
        descriptions: { [preview.rows[0]!.externalId]: "   " },
      })
    ).rejects.toThrow();
    expect(await stored()).toHaveLength(0);
  });

  it("cleans a CSV import the same way", async () => {
    const walmart = "WAL-MART # 3050        LONDON        ON";
    const transfer = "Interac e-Transfer from John";
    const input = {
      ofx: undefined,
      csv: csvStatement(
        csvRow({ description: walmart, net_cash_amount: "-10.00" }),
        csvRow({
          description: transfer,
          net_cash_amount: "-4.00",
          effective_time: "12:31:00",
        })
      ),
    };
    const preview = (await (await call(input)).json()) as {
      rows: { externalId: string; description: string; bankDescription: string }[];
    };
    expect(preview.rows[0]).toMatchObject({
      description: "Wal-Mart",
      bankDescription: walmart,
    });
    expect(preview.rows[1]).toMatchObject({
      description: transfer,
      bankDescription: transfer,
    });
    expect(
      await (
        await call({
          ...input,
          dryRun: false,
          descriptions: {
            [preview.rows[0]!.externalId]: "Neighbourhood Walmart",
            "not-in-the-file": "Ignored",
          },
        })
      ).json()
    ).toMatchObject({ inserted: 2 });
    expect(await stored()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "Neighbourhood Walmart",
          bankDescription: walmart,
        }),
        expect.objectContaining({
          description: transfer,
          bankDescription: transfer,
        }),
      ])
    );
  });

  it("rejects an empty CSV description override", async () => {
    const input = {
      ofx: undefined,
      csv: csvStatement(csvRow({ description: "WAL-MART # 3050        LONDON        ON" })),
    };
    const preview = (await (await call(input)).json()) as {
      rows: { externalId: string }[];
    };
    await expect(
      call({
        ...input,
        dryRun: false,
        descriptions: { [preview.rows[0]!.externalId]: " " },
      })
    ).rejects.toThrow();
    expect(await stored()).toHaveLength(0);
  });

  it("names an interest charge in the viewer's language", async () => {
    const raw = "PURCHASE INTEREST 12.99%";
    const ofx = statement(named(raw, "interest"));
    expect(
      await (await call({ ofx }, { "Accept-Language": "es" })).json()
    ).toMatchObject({
      rows: [
        expect.objectContaining({
          description: "Cargo por intereses",
          bankDescription: raw,
        }),
      ],
    });
  });

  it("rejects malformed files before writing", async () => {
    await expect(call({ ofx: "not OFX", dryRun: false })).rejects.toThrow(
      "Invalid"
    );
    expect(await stored()).toHaveLength(0);
  });

  it("applies a user alias name and category in the preview", async () => {
    const raw = WALMART;
    const categoryId = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedFinancialCategory(db, {
      id: categoryId,
      householdId,
      name: "Groceries",
    });
    await db.insert(merchantAliases).values({
      householdId,
      merchantKey: cleanBankDescription(raw, "en").merchantKey,
      displayName: "My Walmart",
      categoryId,
      source: "user",
    });
    const preview = (await (await call({ ofx: statement(named(raw, "walmart")) })).json()) as {
      rows: PreviewAliasRow[];
    };
    expect(preview.rows[0]).toMatchObject({
      description: "My Walmart",
      merchantKey: cleanBankDescription(raw, "en").merchantKey,
      categoryId,
      categorySource: "user",
      nameSource: "user",
      bankDescription: raw,
    });
  });

  it("drops alias categories that are archived, deleted, or the other type", async () => {
    const db = createTestDb(getIntegrationEnv().DB);
    const archivedId = crypto.randomUUID();
    const deletedId = crypto.randomUUID();
    const incomeId = crypto.randomUUID();
    await seedFinancialCategory(db, {
      id: archivedId,
      householdId,
      name: "Archived groceries",
    });
    await seedFinancialCategory(db, {
      id: deletedId,
      householdId,
      name: "Deleted groceries",
    });
    await seedFinancialCategory(db, {
      id: incomeId,
      householdId,
      name: "Paycheck",
      type: "income",
    });
    await db
      .update(financialCategories)
      .set({ archived: true })
      .where(
        and(
          eq(financialCategories.id, archivedId),
          scopeToHousehold(financialCategories.householdId, householdId)
        )
      );
    await db
      .update(financialCategories)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(financialCategories.id, deletedId),
          scopeToHousehold(financialCategories.householdId, householdId)
        )
      );
    const rows = [
      { raw: "ARCHIVED MART        LONDON        ON", id: "archived", categoryId: archivedId },
      { raw: "DELETED MART         LONDON        ON", id: "deleted", categoryId: deletedId },
      { raw: "INCOME MART          LONDON        ON", id: "income", categoryId: incomeId },
    ];
    for (const row of rows) {
      await db.insert(merchantAliases).values({
        householdId,
        merchantKey: cleanBankDescription(row.raw, "en").merchantKey,
        displayName: `Name ${row.id}`,
        categoryId: row.categoryId,
        source: "user",
      });
    }
    const preview = (await (
      await call({
        ofx: statement(rows.map((row) => named(row.raw, row.id)).join("")),
      })
    ).json()) as { rows: PreviewAliasRow[] };
    expect(preview.rows).toEqual([
      expect.objectContaining({
        description: "Name archived",
        nameSource: "user",
        categoryId: null,
        categorySource: "none",
      }),
      expect.objectContaining({
        description: "Name deleted",
        nameSource: "user",
        categoryId: null,
        categorySource: "none",
      }),
      expect.objectContaining({
        description: "Name income",
        nameSource: "user",
        categoryId: null,
        categorySource: "none",
      }),
    ]);
  });

  it("previews a cleaned name and no category when the merchant is unknown", async () => {
    const raw = WALMART;
    const preview = (await (await call({ ofx: statement(named(raw, "walmart")) })).json()) as {
      rows: PreviewAliasRow[];
    };
    expect(preview.rows[0]).toMatchObject({
      description: "Wal-Mart",
      merchantKey: cleanBankDescription(raw, "en").merchantKey,
      categoryId: null,
      categorySource: "none",
      nameSource: "none",
    });
  });

  it("stores a chosen category id and name from confirm", async () => {
    const raw = WALMART;
    const categoryId = crypto.randomUUID();
    await seedFinancialCategory(createTestDb(getIntegrationEnv().DB), {
      id: categoryId,
      householdId,
      name: "Groceries",
    });
    const ofx = statement(named(raw, "walmart"));
    const preview = (await (await call({ ofx })).json()) as { rows: { externalId: string }[] };
    expect(
      await (
        await call({
          ofx,
          dryRun: false,
          categories: { [preview.rows[0]!.externalId]: categoryId },
        })
      ).json()
    ).toMatchObject({ inserted: 1, learned: 1 });
    expect(await stored()).toEqual([
      expect.objectContaining({ categoryId, category: "Groceries" }),
    ]);
    expect(await aliases()).toEqual([
      expect.objectContaining({ categoryId, source: "user" }),
    ]);
  });

  it("stores the alias category when confirm omits categories", async () => {
    const raw = WALMART;
    const categoryId = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedFinancialCategory(db, {
      id: categoryId,
      householdId,
      name: "Groceries",
    });
    await db.insert(merchantAliases).values({
      householdId,
      merchantKey: cleanBankDescription(raw, "en").merchantKey,
      displayName: "My Walmart",
      categoryId,
      source: "user",
    });
    expect(
      await (await call({ ofx: statement(named(raw, "walmart")), dryRun: false })).json()
    ).toMatchObject({ inserted: 1, learned: 0 });
    expect(await stored()).toEqual([
      expect.objectContaining({
        categoryId,
        category: "Groceries",
        description: "My Walmart",
      }),
    ]);
    expect(await aliases()).toEqual([
      expect.objectContaining({ displayName: "My Walmart", categoryId, source: "user" }),
    ]);
  });

  it("stores the alias display name when confirm omits description overrides", async () => {
    const raw = WALMART;
    const categoryId = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedFinancialCategory(db, {
      id: categoryId,
      householdId,
      name: "Groceries",
    });
    await db.insert(merchantAliases).values({
      householdId,
      merchantKey: cleanBankDescription(raw, "en").merchantKey,
      displayName: "My Walmart",
      categoryId,
      source: "user",
    });
    expect(
      await (await call({ ofx: statement(named(raw, "walmart")), dryRun: false })).json()
    ).toMatchObject({ inserted: 1, learned: 0 });
    expect(await stored()).toEqual([
      expect.objectContaining({ description: "My Walmart", categoryId }),
    ]);
  });

  it("falls back to Uncategorized when a confirm category cannot be used", async () => {
    const archivedId = crypto.randomUUID();
    const incomeId = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedFinancialCategory(db, { id: archivedId, householdId, name: "Old groceries" });
    await seedFinancialCategory(db, {
      id: incomeId,
      householdId,
      name: "Paycheck",
      type: "income",
    });
    await db
      .update(financialCategories)
      .set({ archived: true })
      .where(
        and(
          eq(financialCategories.id, archivedId),
          scopeToHousehold(financialCategories.householdId, householdId)
        )
      );
    const specs = [
      { id: "missing", raw: "MISSING MART        LONDON        ON", categoryId: crypto.randomUUID() },
      { id: "archived", raw: "ARCHIVED MART       LONDON        ON", categoryId: archivedId },
      { id: "income", raw: "INCOME MART          LONDON        ON", categoryId: incomeId },
    ];
    const ofx = statement(specs.map((row) => named(row.raw, row.id, "-10.00")).join(""));
    const preview = (await (await call({ ofx })).json()) as { rows: { externalId: string }[] };
    const categories = Object.fromEntries(
      preview.rows.map((row, index) => [row.externalId, specs[index]!.categoryId])
    );
    expect(await (await call({ ofx, dryRun: false, categories })).json()).toMatchObject({
      inserted: 3,
      learned: 0,
    });
    const saved = await stored();
    expect(saved).toHaveLength(3);
    expect(saved.every((row) => row.category === "Uncategorized")).toBe(true);
    expect(saved.every((row) => row.categoryId !== archivedId && row.categoryId !== incomeId)).toBe(
      true
    );
    expect(await aliases()).toHaveLength(0);
  });

  it("learns a changed name and category, and keeps a category when only the name changes", async () => {
    const raw = WALMART;
    const groceries = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedFinancialCategory(db, { id: groceries, householdId, name: "Groceries" });
    const ofx = statement(named(raw, "walmart"));
    const preview = (await (await call({ ofx })).json()) as { rows: { externalId: string }[] };
    const externalId = preview.rows[0]!.externalId;
    expect(
      await (
        await call({
          ofx,
          dryRun: false,
          descriptions: { [externalId]: "My Walmart" },
          categories: { [externalId]: groceries },
        })
      ).json()
    ).toMatchObject({ learned: 1 });
    expect(await aliases()).toEqual([
      expect.objectContaining({
        displayName: "My Walmart",
        categoryId: groceries,
        source: "user",
      }),
    ]);

    const again = statement(named(raw, "walmart-2", "-8.00"));
    const second = (await (await call({ ofx: again })).json()) as {
      rows: { externalId: string; description: string }[];
    };
    expect(second.rows[0]).toMatchObject({
      description: "My Walmart",
      categoryId: groceries,
      categorySource: "user",
    });
    expect(
      await (
        await call({
          ofx: again,
          dryRun: false,
          descriptions: { [second.rows[0]!.externalId]: "Neighbourhood Walmart" },
        })
      ).json()
    ).toMatchObject({ learned: 1 });
    expect(await aliases()).toEqual([
      expect.objectContaining({
        displayName: "Neighbourhood Walmart",
        categoryId: groceries,
        source: "user",
      }),
    ]);
  });

  it("writes nothing when confirm accepts the suggestion", async () => {
    const raw = WALMART;
    const before = await aliases();
    expect(
      await (await call({ ofx: statement(named(raw, "walmart")), dryRun: false })).json()
    ).toMatchObject({ learned: 0 });
    expect(await aliases()).toEqual(before);
  });

  it("does not clear an alias category when confirm chooses Uncategorized", async () => {
    const raw = WALMART;
    const categoryId = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedFinancialCategory(db, { id: categoryId, householdId, name: "Groceries" });
    await db.insert(merchantAliases).values({
      householdId,
      merchantKey: cleanBankDescription(raw, "en").merchantKey,
      displayName: "My Walmart",
      categoryId,
      source: "user",
    });
    const ofx = statement(named(raw, "walmart"));
    const preview = (await (await call({ ofx })).json()) as { rows: { externalId: string }[] };
    expect(
      await (
        await call({
          ofx,
          dryRun: false,
          categories: { [preview.rows[0]!.externalId]: null },
        })
      ).json()
    ).toMatchObject({ learned: 0 });
    expect(await stored()).toEqual([
      expect.objectContaining({ category: "Uncategorized" }),
    ]);
    expect(await aliases()).toEqual([
      expect.objectContaining({ displayName: "My Walmart", categoryId, source: "user" }),
    ]);
  });

  it("learns the majority name and category when rows for one merchant disagree", async () => {
    const raw = WALMART;
    const groceries = crypto.randomUUID();
    const dining = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedFinancialCategory(db, { id: groceries, householdId, name: "Groceries" });
    await seedFinancialCategory(db, { id: dining, householdId, name: "Dining" });
    const ofx = statement(
      named(raw, "a", "-10.00") + named(raw, "b", "-11.00") + named(raw, "c", "-12.00")
    );
    const preview = (await (await call({ ofx })).json()) as { rows: { externalId: string }[] };
    const [first, second, third] = preview.rows;
    expect(
      await (
        await call({
          ofx,
          dryRun: false,
          descriptions: {
            [first!.externalId]: "Neighbourhood",
            [second!.externalId]: "Superstore",
            [third!.externalId]: "Neighbourhood",
          },
          categories: {
            [first!.externalId]: groceries,
            [second!.externalId]: dining,
            [third!.externalId]: groceries,
          },
        })
      ).json()
    ).toMatchObject({ inserted: 3, learned: 1 });
    expect(await aliases()).toEqual([
      expect.objectContaining({
        displayName: "Neighbourhood",
        categoryId: groceries,
        source: "user",
      }),
    ]);
    const saved = await stored();
    expect(saved.filter((row) => row.categoryId === groceries)).toHaveLength(2);
    expect(saved.filter((row) => row.categoryId === dining)).toHaveLength(1);
  });
});

const WALMART = "WAL-MART # 3050        LONDON        ON";

type PreviewAliasRow = {
  externalId: string;
  description: string | null;
  bankDescription: string;
  merchantKey: string | null;
  categoryId: string | null;
  categorySource: "user" | "ai" | "none";
  nameSource: "user" | "ai" | "none";
};

function named(name: string, id: string, amount = "-12.34") {
  return transaction(id, amount).replace(
    "<NAME>Café &amp; market",
    `<NAME>${name}`
  );
}
