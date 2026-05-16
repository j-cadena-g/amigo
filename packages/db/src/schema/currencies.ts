import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// Supported currencies — no pgEnum in SQLite, use text with enum constraint
export const CURRENCY_CODES = ["CAD", "USD", "EUR", "GBP", "MXN"] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** Default when household home currency is missing or invalid in DB. */
export const DEFAULT_HOME_CURRENCY: CurrencyCode = "CAD";

export function parseHomeCurrency(raw: string | null | undefined): CurrencyCode {
  if (raw != null && (CURRENCY_CODES as readonly string[]).includes(raw)) {
    return raw as CurrencyCode;
  }
  return DEFAULT_HOME_CURRENCY;
}

// Historical exchange rates table
export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    baseCurrency: text("base_currency", { enum: CURRENCY_CODES }).notNull(),
    targetCurrency: text("target_currency", { enum: CURRENCY_CODES }).notNull(),
    date: text("date").notNull(), // ISO 8601 YYYY-MM-DD
    rate: real("rate").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({
      columns: [table.baseCurrency, table.targetCurrency, table.date],
    }),
  ]
);

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;
