import {
  and,
  assets,
  budgets,
  debts,
  eq,
  financialAccounts,
  isNull,
  scopeToHousehold,
  sql,
  transactions,
  type CurrencyCode,
  type DrizzleD1,
} from "@amigo/db";
import type { Env } from "../env";
import { getExchangeRateForRecord } from "./exchange-rates";

const BATCH_CHUNK_SIZE = 25;

type FxRowTable =
  | typeof financialAccounts
  | typeof debts
  | typeof assets
  | typeof transactions;

async function resolveRatesForCurrencies(
  env: Env,
  currencies: Iterable<CurrencyCode>,
  newHome: CurrencyCode
): Promise<Map<CurrencyCode, number>> {
  const rates = new Map<CurrencyCode, number>();
  for (const currency of currencies) {
    if (currency === newHome || rates.has(currency)) continue;
    const rate = await getExchangeRateForRecord(env, currency, newHome);
    if (rate === null) {
      throw new Error(
        `Missing exchange rate from ${currency} to ${newHome} for home currency refresh`
      );
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(
        `Invalid exchange rate from ${currency} to ${newHome}: ${String(rate)}`
      );
    }
    rates.set(currency, rate);
  }
  return rates;
}

async function listDistinctCurrencies(
  db: DrizzleD1,
  table: FxRowTable | typeof budgets,
  householdId: string
): Promise<CurrencyCode[]> {
  const rows = await db
    .selectDistinct({ currency: table.currency })
    .from(table)
    .where(
      and(
        scopeToHousehold(table.householdId, householdId),
        isNull(table.deletedAt)
      )
    )
    .all();
  return rows.map((row) => row.currency as CurrencyCode);
}

async function runBatched(db: DrizzleD1, statements: unknown[]): Promise<void> {
  for (let i = 0; i < statements.length; i += BATCH_CHUNK_SIZE) {
    const chunk = statements.slice(i, i + BATCH_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    await db.batch(chunk as unknown as Parameters<typeof db.batch>[0]);
  }
}

function buildFxUpdates(
  db: DrizzleD1,
  table: FxRowTable,
  householdId: string,
  newHome: CurrencyCode,
  currencies: CurrencyCode[],
  rates: Map<CurrencyCode, number>,
  now: Date
): unknown[] {
  const statements: unknown[] = [];

  if (currencies.includes(newHome)) {
    statements.push(
      db
        .update(table)
        .set({ exchangeRateToHome: null, updatedAt: now })
        .where(
          and(
            scopeToHousehold(table.householdId, householdId),
            eq(table.currency, newHome),
            isNull(table.deletedAt)
          )
        )
    );
  }

  for (const currency of currencies) {
    if (currency === newHome) continue;
    const rate = rates.get(currency);
    if (rate === undefined) {
      throw new Error(
        `Missing exchange rate from ${currency} to ${newHome} for home currency refresh`
      );
    }
    statements.push(
      db
        .update(table)
        .set({ exchangeRateToHome: rate, updatedAt: now })
        .where(
          and(
            scopeToHousehold(table.householdId, householdId),
            eq(table.currency, currency),
            isNull(table.deletedAt)
          )
        )
    );
  }

  return statements;
}

function buildBudgetUpdates(
  db: DrizzleD1,
  householdId: string,
  newHome: CurrencyCode,
  currencies: CurrencyCode[],
  rates: Map<CurrencyCode, number>,
  now: Date
): unknown[] {
  const statements: unknown[] = [];

  if (currencies.includes(newHome)) {
    statements.push(
      db
        .update(budgets)
        .set({
          limitAmountHome: sql`${budgets.limitAmount}`,
          exchangeRateLimitToHome: null,
          updatedAt: now,
        })
        .where(
          and(
            scopeToHousehold(budgets.householdId, householdId),
            eq(budgets.currency, newHome),
            isNull(budgets.deletedAt)
          )
        )
    );
  }

  for (const currency of currencies) {
    if (currency === newHome) continue;
    const rate = rates.get(currency);
    if (rate === undefined) {
      throw new Error(
        `Missing exchange rate from ${currency} to ${newHome} for home currency refresh`
      );
    }
    statements.push(
      db
        .update(budgets)
        .set({
          // Mirror computeLimitAmountHomeCents: non-zero limits must not round to 0.
          limitAmountHome: sql`CASE WHEN ${budgets.limitAmount} > 0 THEN MAX(1, ROUND(CAST(${budgets.limitAmount} AS REAL) * ${rate})) ELSE 0 END`,
          exchangeRateLimitToHome: rate,
          updatedAt: now,
        })
        .where(
          and(
            scopeToHousehold(budgets.householdId, householdId),
            eq(budgets.currency, currency),
            isNull(budgets.deletedAt)
          )
        )
    );
  }

  return statements;
}

/**
 * Refresh denormalized home-currency FX snapshots after a household
 * `home_currency` change. Never rewrites native amounts.
 */
export async function refreshHouseholdHomeCurrencyRates(
  env: Env,
  db: DrizzleD1,
  householdId: string,
  newHome: CurrencyCode
): Promise<void> {
  const now = new Date();
  const fxTables: FxRowTable[] = [
    financialAccounts,
    debts,
    assets,
    transactions,
  ];

  const currenciesByTable = new Map<FxRowTable | typeof budgets, CurrencyCode[]>();
  const allCurrencies = new Set<CurrencyCode>();

  for (const table of fxTables) {
    const currencies = await listDistinctCurrencies(db, table, householdId);
    currenciesByTable.set(table, currencies);
    for (const currency of currencies) allCurrencies.add(currency);
  }

  const budgetCurrencies = await listDistinctCurrencies(db, budgets, householdId);
  currenciesByTable.set(budgets, budgetCurrencies);
  for (const currency of budgetCurrencies) allCurrencies.add(currency);

  // Fail before any writes if a required rate is missing.
  const rates = await resolveRatesForCurrencies(env, allCurrencies, newHome);

  const statements: unknown[] = [];
  for (const table of fxTables) {
    statements.push(
      ...buildFxUpdates(
        db,
        table,
        householdId,
        newHome,
        currenciesByTable.get(table) ?? [],
        rates,
        now
      )
    );
  }
  statements.push(
    ...buildBudgetUpdates(
      db,
      householdId,
      newHome,
      currenciesByTable.get(budgets) ?? [],
      rates,
      now
    )
  );

  await runBatched(db, statements);
}
