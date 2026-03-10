import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// Supported currencies — no pgEnum in SQLite, use text with enum constraint
export const CURRENCY_CODES = ["CAD", "USD", "EUR", "GBP", "MXN"] as const;

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
export type CurrencyCode = (typeof CURRENCY_CODES)[number];
