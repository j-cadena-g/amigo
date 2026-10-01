import {
  and,
  eq,
  inArray,
  isNull,
  isNotNull,
  or,
  scopeToHousehold,
  transactions,
  type Transaction,
  type DrizzleD1,
  type CurrencyCode,
} from "@amigo/db";
import type { AppSession, Env } from "../env";
import type { OfxRow } from "./ofx";
import { insertManyAuditLogs } from "./audit";
import { getExchangeRateForRecord } from "./exchange-rates";

/** Match only unchanged imported amounts in the selected account. Never infer currency from a merchant. */
export async function currencyCorrectionMatches(
  db: DrizzleD1,
  session: AppSession,
  accountId: string,
  rows: OfxRow[],
  currency: CurrencyCode
) {
  const matches = [];
  const source = new Map(rows.map((row) => [row.externalId, row]));
  const ids = [...source.keys()];
  for (let i = 0; i < ids.length; i += 80) {
    const stored = await db
      .select()
      .from(transactions)
      .where(
        and(
          scopeToHousehold(transactions.householdId, session.householdId),
          eq(transactions.userId, session.userId),
          eq(transactions.accountId, accountId),
          isNull(transactions.deletedAt),
          isNotNull(transactions.importBatchId),
          isNull(transactions.chargedAmount),
          inArray(transactions.externalId, ids.slice(i, i + 80))
        )
      );
    for (const record of stored) {
      const row = source.get(record.externalId!)!;
      if (
        record.currency === row.currency &&
        record.currency !== currency &&
        record.amount === row.amountCents &&
        record.date === row.date &&
        record.type === row.type
      )
        matches.push(record);
    }
  }
  return matches;
}

export async function correctImportCurrency(
  db: DrizzleD1,
  env: Env,
  session: AppSession,
  matches: Awaited<ReturnType<typeof currencyCorrectionMatches>>,
  currency: CurrencyCode,
  homeCurrency: CurrencyCode
) {
  if (!matches.length) return 0;
  const exchangeRateToHome = await getExchangeRateForRecord(
    env,
    currency,
    homeCurrency
  );
  // Shared guards and SET values take 7 of D1's 100 bound parameters; each row's guard takes 5.
  const ROWS_PER_UPDATE = 18;
  const groups = new Map<string, typeof matches>();
  for (const record of matches) {
    const key = `${record.accountId}\u0000${record.currency}`;
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }
  const statements = [...groups.values()].flatMap((group) => {
    const chunks = [];
    for (let i = 0; i < group.length; i += ROWS_PER_UPDATE) {
      const chunk = group.slice(i, i + ROWS_PER_UPDATE);
      chunks.push(
        db
          .update(transactions)
          .set({ currency, exchangeRateToHome, updatedAt: new Date() })
          .where(
            and(
              scopeToHousehold(transactions.householdId, session.householdId),
              eq(transactions.userId, session.userId),
              eq(transactions.accountId, chunk[0]!.accountId!),
              eq(transactions.currency, chunk[0]!.currency),
              isNull(transactions.chargedAmount),
              isNull(transactions.deletedAt),
              or(
                ...chunk.map((record) =>
                  and(
                    eq(transactions.id, record.id),
                    eq(transactions.externalId, record.externalId!),
                    eq(transactions.amount, record.amount),
                    eq(transactions.date, record.date),
                    eq(transactions.type, record.type)
                  )
                )
              )
            )
          )
          .returning()
      );
    }
    return chunks;
  });
  const results = await db.batch(
    statements as unknown as Parameters<typeof db.batch>[0]
  );
  const before = new Map(matches.map((record) => [record.id, record]));
  const auditRows = (results as unknown as Transaction[][]).flat().map((record) => ({
    householdId: session.householdId,
    tableName: "transactions",
    recordId: record.id,
    operation: "UPDATE" as const,
    oldValues: before.get(record.id),
    newValues: record,
    changedBy: session.userId,
  }));
  await insertManyAuditLogs(db, auditRows);
  return auditRows.length;
}
