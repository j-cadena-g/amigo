import {
  financialAccounts,
  financialCategories,
  merchantAliases,
  scopeToHousehold,
  transactions,
} from "@amigo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanBankDescription } from "../lib/bank-description";
import { JEV_MODEL } from "../lib/jev";
import { MERCHANT_NAME_MODEL } from "../lib/merchant-names";
import { handleTransactionsRequest } from "./transactions";
import { createTestDb, seedHouseholdWithOwner, testSession } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import { statement, transaction } from "../test/ofx-fixture";
import type { Env } from "../env";

const PETRO = "PETRO-CANADA";
const MYSTERY = "MYSTERY SHOPPE";
const TRANSFER = "Interac e-Transfer from John";
const WALMART = "WALMART";
const INTEREST = "PURCHASE INTEREST 12.99%";
const PAYROLL = "ACME PAYROLL";
const GAS_LABEL = "Living expenses › Gas";

describe("AI category suggestions on import preview", () => {
  let householdId: string;
  let ownerId: string;
  let accountId: string;
  let livingId: string;
  let gasId: string;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    householdId = crypto.randomUUID();
    ownerId = crypto.randomUUID();
    accountId = crypto.randomUUID();
    livingId = crypto.randomUUID();
    gasId = crypto.randomUUID();
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
    await db.insert(financialCategories).values({
      id: livingId,
      householdId,
      name: "Living expenses",
      description: "Running the home: rent, utilities, and transit.",
      type: "expense",
    });
    await db.insert(financialCategories).values([
      {
        id: gasId,
        householdId,
        parentId: livingId,
        name: "Gas",
        type: "expense",
      },
      {
        id: crypto.randomUUID(),
        householdId,
        name: "Uncategorized",
        description: "uncategorized-secret",
        type: "expense",
      },
      {
        id: crypto.randomUUID(),
        householdId,
        name: "Old clubs",
        description: "archived-secret",
        type: "expense",
        archived: true,
      },
      {
        id: crypto.randomUUID(),
        householdId,
        name: "Gone category",
        description: "deleted-secret",
        type: "expense",
        deletedAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        householdId,
        name: "Salary",
        type: "income",
      },
    ]);
    const otherHouseholdId = crypto.randomUUID();
    await seedHouseholdWithOwner(db, {
      householdId: otherHouseholdId,
      ownerId: crypto.randomUUID(),
      ownerAuthId: crypto.randomUUID(),
      householdName: "Other",
    });
    await db.insert(financialCategories).values({
      id: crypto.randomUUID(),
      householdId: otherHouseholdId,
      name: "Neighbour groceries",
      description: "other-household-secret",
      type: "expense",
    });
    await db.insert(merchantAliases).values({
      householdId,
      merchantKey: cleanBankDescription(WALMART, "en").merchantKey,
      displayName: "My Walmart",
      categoryId: livingId,
      source: "user",
    });
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function call(extra: Record<string, unknown>, env: Env) {
    return handleTransactionsRequest({
      env,
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
  }

  const aliases = () =>
    createTestDb(getIntegrationEnv().DB)
      .select()
      .from(merchantAliases)
      .where(scopeToHousehold(merchantAliases.householdId, householdId));

  const stored = () =>
    createTestDb(getIntegrationEnv().DB)
      .select()
      .from(transactions)
      .where(scopeToHousehold(transactions.householdId, householdId));

  it("suggests categories for unknown merchants and keeps the rest out of Jev", async () => {
    const run = importRun();
    const env = envWithAi(run);
    const ofx = statement(
      [
        named(PETRO, "petro", "-40.00"),
        named(PETRO, "petro-income", "40.00"),
        named(MYSTERY, "mystery", "-8.00"),
        named(TRANSFER, "transfer", "-15.00"),
        named(WALMART, "walmart", "-22.00"),
        named(INTEREST, "interest", "-3.00"),
        named(PAYROLL, "payroll", "1000.00"),
      ].join("")
    );
    const preview = (await (await call({ ofx }, env)).json()) as { rows: PreviewRow[] };

    expect(preview.rows.map((row) => [row.type, row.description, row.categorySource, row.categoryId])).toEqual([
      ["expense", "Petro Canada", "ai", gasId],
      ["income", "Petro Canada", "none", null],
      ["expense", cleanBankDescription(MYSTERY, "en").name, "none", null],
      ["expense", expect.any(String), "none", null],
      ["expense", "My Walmart", "user", livingId],
      ["expense", "Interest charge", "ai", gasId],
      ["income", cleanBankDescription(PAYROLL, "en").name, "none", null],
    ]);
    expect(preview.rows[3]?.description).toContain("John");

    const asked = jevInputs(run);
    expect(asked.length).toBeGreaterThan(0);
    for (const input of asked) {
      expect(input.questions.category.criteria).toMatchObject({
        "Living expenses": "Running the home: rent, utilities, and transit.",
        [GAS_LABEL]: "Gas",
      });
      expect(input.questions.category.criteria).not.toHaveProperty("Uncategorized");
      expect(input.questions.category.criteria).not.toHaveProperty("Salary");
      const text = JSON.stringify(input);
      expect(text).not.toContain("archived-secret");
      expect(text).not.toContain("Old clubs");
      expect(text).not.toContain("deleted-secret");
      expect(text).not.toContain("uncategorized-secret");
      expect(text).not.toContain("other-household-secret");
      expect(text).not.toContain("Neighbour groceries");
      expect(text).not.toContain("John");
      expect(text).not.toContain("12.99");
      expect(text).not.toContain("Test card");
      expect(text).not.toContain(cleanBankDescription(WALMART, "en").merchantKey);
      expect(text).not.toContain("ACME");
      expect(input.questions.category.instructions).toContain("Canada");
    }
    expect(asked.some((input) => input.state.includes("PETRO-CANADA"))).toBe(true);
    expect(asked.some((input) => input.state.includes("PURCHASE INTEREST"))).toBe(true);
    expect(asked.some((input) => input.state.toLowerCase().includes("mystery"))).toBe(true);
    expect(run.mock.calls.filter((entry) => entry[0] === JEV_MODEL)).toHaveLength(asked.length);

    expect(await aliases()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          merchantKey: cleanBankDescription(PETRO, "en").merchantKey,
          displayName: "Petro Canada",
          categoryId: gasId,
          source: "ai",
        }),
        expect.objectContaining({
          merchantKey: cleanBankDescription(INTEREST, "en").merchantKey,
          categoryId: gasId,
          source: "ai",
        }),
        expect.objectContaining({
          merchantKey: cleanBankDescription(WALMART, "en").merchantKey,
          displayName: "My Walmart",
          categoryId: livingId,
          source: "user",
        }),
      ])
    );
    expect((await aliases()).some((row) => row.merchantKey.includes("MYSTERY"))).toBe(false);
    expect((await aliases()).some((row) => row.merchantKey.includes("JOHN"))).toBe(false);

    run.mockClear();
    await call({ ofx }, env);
    const again = jevInputs(run);
    expect(again.length).toBeGreaterThan(0);
    expect(again.every((input) => input.state.toLowerCase().includes("mystery"))).toBe(true);
    const logged = warn.mock.calls.map((entry: unknown[]) => String(entry[0])).join("\n");
    expect(logged).not.toContain("John");
    expect(logged).not.toContain("PETRO-CANADA");
    expect(logged).not.toContain("12.99");
  });

  it("does not call Jev again after the category was saved", async () => {
    const run = importRun();
    const env = envWithAi(run);
    const ofx = statement(named(PETRO, "petro", "-40.00"));
    await call({ ofx }, env);
    expect(jevInputs(run).length).toBe(1);

    run.mockClear();
    const again = (await (await call({ ofx }, env)).json()) as { rows: PreviewRow[] };
    expect(jevInputs(run)).toEqual([]);
    expect(run.mock.calls.some((entry) => entry[0] === JEV_MODEL)).toBe(false);
    expect(again.rows[0]).toMatchObject({
      description: "Petro Canada",
      categoryId: gasId,
      categorySource: "ai",
    });
  });

  it("stores the suggested category on confirm, and a different category becomes a user alias", async () => {
    const run = importRun();
    const env = envWithAi(run);
    const ofx = statement(named(PETRO, "petro", "-40.00"));
    const preview = (await (await call({ ofx }, env)).json()) as { rows: PreviewRow[] };
    const externalId = preview.rows[0]?.externalId;
    expect(externalId).toEqual(expect.any(String));

    expect(await (await call({ ofx, dryRun: false }, env)).json()).toMatchObject({ inserted: 1 });
    expect(await stored()).toEqual([
      expect.objectContaining({
        description: "Petro Canada",
        categoryId: gasId,
        category: "Gas",
      }),
    ]);
    expect(await aliases()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          merchantKey: cleanBankDescription(PETRO, "en").merchantKey,
          categoryId: gasId,
          source: "ai",
        }),
      ])
    );

    const jevBeforeOverride = jevInputs(run).length;
    const overrideOfx = statement(named(PETRO, "petro-2", "-18.00"));
    const overridePreview = (await (await call({ ofx: overrideOfx }, env)).json()) as {
      rows: PreviewRow[];
    };
    expect(overridePreview.rows[0]?.categorySource).toBe("ai");
    expect(jevInputs(run)).toHaveLength(jevBeforeOverride);
    const overrideId = overridePreview.rows[0]?.externalId ?? "";
    expect(
      await (await call({ ofx: overrideOfx, dryRun: false, categories: { [overrideId]: livingId } }, env)).json()
    ).toMatchObject({ inserted: 1 });
    expect(await stored()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoryId: livingId, category: "Living expenses" }),
      ])
    );
    expect(
      (await aliases()).find(
        (row) => row.merchantKey === cleanBankDescription(PETRO, "en").merchantKey
      )
    ).toMatchObject({ categoryId: livingId, source: "user" });
  });

  it("still asks Jev when the neuron budget blocks merchant names", async () => {
    const run = importRun();
    const env = { ...envWithAi(run), AI_DAILY_NEURON_BUDGET: "1" };
    const preview = (await (
      await call({ ofx: statement(named(PETRO, "petro", "-40.00")) }, env)
    ).json()) as { rows: PreviewRow[] };
    expect(run.mock.calls.some((entry) => entry[0] === MERCHANT_NAME_MODEL)).toBe(false);
    expect(jevInputs(run)).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({
      description: cleanBankDescription(PETRO, "en").name,
      categoryId: gasId,
      categorySource: "ai",
    });
  });
});

type PreviewRow = {
  description: string | null;
  categoryId: string | null;
  categorySource: "user" | "ai" | "none";
  nameSource: "user" | "ai" | "none";
  type: "income" | "expense";
  externalId: string;
};

function named(name: string, id: string, amount: string) {
  return transaction(id, amount).replace("<NAME>Café &amp; market", `<NAME>${name}`);
}

function envWithAi(run: unknown): Env {
  return { ...getIntegrationEnv(), AI: { run } as unknown as Ai };
}

function importRun() {
  return vi.fn(async (model: string, input: unknown) => {
    if (model === MERCHANT_NAME_MODEL) {
      const messages = (input as { messages: { content: string }[] }).messages;
      const { keys } = JSON.parse(messages[1]!.content) as { keys: string[] };
      const content = Object.fromEntries(
        keys.map((key) => [
          key,
          key === cleanBankDescription(PETRO, "en").merchantKey
            ? { known: true, name: "Petro Canada" }
            : { known: false, name: key },
        ])
      );
      return {
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
        usage: { neurons: 16 },
      };
    }
    if (model === JEV_MODEL) {
      const state = (input as { state: string }).state;
      const confidence = state.toLowerCase().includes("mystery") ? 0.41 : 0.92;
      return {
        state: "Completed",
        result: {
          model: "jev-1.13.0",
          answers: {
            category: {
              type: "choice",
              choice: GAS_LABEL,
              probabilities: { [GAS_LABEL]: confidence },
              confidence,
            },
          },
          usage: { input_tokens: 549, output_tokens: 83 },
        },
      };
    }
    throw new Error(`unexpected model ${model}`);
  });
}

function jevInputs(run: ReturnType<typeof vi.fn>) {
  return run.mock.calls
    .filter((entry) => entry[0] === JEV_MODEL)
    .map(
      (entry) =>
        entry[1] as {
          state: string;
          questions: { category: { instructions: string; criteria: Record<string, string> } };
        }
    );
}
