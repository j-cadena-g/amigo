import { financialAccounts, merchantAliases, scopeToHousehold, transactions } from "@amigo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanBankDescription } from "../lib/bank-description";
import { handleTransactionsRequest } from "./transactions";
import { createTestDb, seedHouseholdWithOwner, testSession } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import { statement, transaction } from "../test/ofx-fixture";
import type { Env } from "../env";

const RCSS = "RCSS OXFORD #2812      LONDON        ON";
const DREW = "DREW'S YIG 7924        LONDON        ON";
const UBER = "UBERONE CA/UBERONEMEMB TORONTO — TORONTO ON";
const WALMART = "WAL-MART # 3050        LONDON        ON";
const INTEREST = "PURCHASE INTEREST 12.99%";

describe("AI merchant names on import preview", () => {
  let householdId: string;
  let ownerId: string;
  let accountId: string;
  let warn: ReturnType<typeof vi.spyOn>;

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

  it("names unknown merchants, saves them, and does not ask again or rename user or charge rows", async () => {
    const db = createTestDb(getIntegrationEnv().DB);
    const walmartKey = cleanBankDescription(WALMART, "en").merchantKey;
    await db.insert(merchantAliases).values({
      householdId,
      merchantKey: walmartKey,
      displayName: "My Walmart",
      source: "user",
    });
    const names: Record<string, string> = {
      [cleanBankDescription(RCSS, "en").merchantKey]: "Real Canadian Superstore",
      [cleanBankDescription(DREW, "en").merchantKey]: "Your Independent Grocer",
      [cleanBankDescription(UBER, "en").merchantKey]: "Uber One",
    };
    const run = namingRun(names);
    const env = envWithAi(run);
    const ofx = statement(
      [RCSS, DREW, UBER, WALMART, INTEREST].map((name, index) => named(name, `row-${index}`)).join("")
    );
    const preview = (await (await call({ ofx }, env)).json()) as {
      rows: PreviewRow[];
    };
    expect(requestedKeys(run)).toEqual(Object.keys(names));
    expect(preview.rows.map((row) => [row.description, row.nameSource])).toEqual([
      ["Real Canadian Superstore", "ai"],
      ["Your Independent Grocer", "ai"],
      ["Uber One", "ai"],
      ["My Walmart", "user"],
      ["Interest charge", "none"],
    ]);
    expect(await aliases()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          merchantKey: namesKey(RCSS),
          displayName: "Real Canadian Superstore",
          source: "ai",
        }),
        expect.objectContaining({
          merchantKey: walmartKey,
          displayName: "My Walmart",
          source: "user",
        }),
      ])
    );
    expect((await aliases()).some((row) => row.merchantKey === "PURCHASE INTEREST")).toBe(false);

    run.mockClear();
    const again = (await (await call({ ofx }, env)).json()) as { rows: PreviewRow[] };
    expect(run).not.toHaveBeenCalled();
    expect(again.rows[0]).toMatchObject({
      description: "Real Canadian Superstore",
      nameSource: "ai",
    });
  });

  it("stores the AI name on confirm without description overrides", async () => {
    const run = namingRun({
      [namesKey(RCSS)]: "Real Canadian Superstore",
    });
    const env = envWithAi(run);
    const ofx = statement(named(RCSS, "rcss"));
    await call({ ofx }, env);
    expect(
      await (await call({ ofx, dryRun: false }, env)).json()
    ).toMatchObject({ inserted: 1 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(await stored()).toEqual([
      expect.objectContaining({ description: "Real Canadian Superstore" }),
    ]);
    expect(await aliases()).toEqual([
      expect.objectContaining({
        displayName: "Real Canadian Superstore",
        source: "ai",
      }),
    ]);
  });

  it("leaves a merchant the model does not know on the cleaned name", async () => {
    const raw = "MYSTERY SHOPPE       LONDON        ON";
    const run = namingRun({});
    const preview = (await (
      await call({ ofx: statement(named(raw, "mystery")) }, envWithAi(run))
    ).json()) as { rows: PreviewRow[] };
    expect(preview.rows[0]).toMatchObject({
      description: cleanBankDescription(raw, "en").name,
      nameSource: "none",
    });
    expect(await aliases()).toEqual([]);
  });

  it("returns the cleaned preview when the model errors", async () => {
    const run = vi.fn(async () => {
      throw new Error("upstream RCSS OXFORD");
    });
    const preview = (await (
      await call({ ofx: statement(named(RCSS, "rcss")) }, envWithAi(run))
    ).json()) as { rows: PreviewRow[] };
    expect(preview.rows[0]).toMatchObject({
      description: cleanBankDescription(RCSS, "en").name,
      nameSource: "none",
    });
    expect(await aliases()).toEqual([]);
    const logged = warn.mock.calls.map((entry: unknown[]) => String(entry[0])).join("\n");
    expect(logged).not.toContain("RCSS");
    expect(logged).toContain("ai-budget");
  });

  it("returns the cleaned preview when the daily budget is exhausted", async () => {
    const run = vi.fn();
    const env = {
      ...envWithAi(run),
      AI_DAILY_NEURON_BUDGET: "1",
    };
    const preview = (await (
      await call({ ofx: statement(named(RCSS, "rcss")) }, env)
    ).json()) as { rows: PreviewRow[] };
    expect(run).not.toHaveBeenCalled();
    expect(preview.rows[0]).toMatchObject({
      description: cleanBankDescription(RCSS, "en").name,
      nameSource: "none",
    });
  });

  it("does not ask the model while repairing currency", async () => {
    const run = vi.fn();
    const response = await call(
      { repairCurrency: true, currencyOverride: "USD" },
      envWithAi(run)
    );
    expect(response.ok).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
});

type PreviewRow = {
  description: string | null;
  nameSource: "user" | "ai" | "none";
};

function namesKey(raw: string): string {
  return cleanBankDescription(raw, "en").merchantKey;
}

function named(name: string, id: string) {
  return transaction(id).replace("<NAME>Café &amp; market", `<NAME>${name}`);
}

function envWithAi(run: unknown): Env {
  return { ...getIntegrationEnv(), AI: { run } as unknown as Ai };
}

function namingRun(names: Record<string, string>) {
  return vi.fn(async (_model: string, input: unknown) => {
    const messages = (input as { messages: { content: string }[] }).messages;
    const { keys } = JSON.parse(messages[1]!.content) as { keys: string[] };
    const content = Object.fromEntries(
      keys.map((key) => [
        key,
        names[key] ? { known: true, name: names[key] } : { known: false, name: key },
      ])
    );
    return {
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
      usage: { neurons: 16 },
    };
  });
}

function requestedKeys(run: ReturnType<typeof vi.fn>): string[] {
  return run.mock.calls.flatMap((call) => {
    const messages = (call[1] as { messages: { content: string }[] }).messages;
    return (JSON.parse(messages[1]!.content) as { keys: string[] }).keys;
  });
}
