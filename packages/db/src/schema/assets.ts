import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { households } from "./households";
import { users } from "./users";
import { CURRENCY_CODES } from "./currencies";

export const ASSET_TYPES = ["BANK", "INVESTMENT", "CASH", "PROPERTY"] as const;

export const assets = sqliteTable(
  "assets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    // Denormalized user info for display when user is deleted
    userDisplayName: text("user_display_name"),
    // Track original creator when data is transferred during "fresh start" restore
    transferredFromUserId: text("transferred_from_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    name: text("name").notNull(),
    type: text("type", { enum: ASSET_TYPES }).notNull(),
    balance: integer("balance").notNull().default(0), // Stored as integer cents
    currency: text("currency", { enum: CURRENCY_CODES }).notNull().default("CAD"),
    // Exchange rate to home currency at time of last update (null if same as home currency)
    exchangeRateToHome: real("exchange_rate_to_home"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("assets_household_id_idx").on(table.householdId)]
);

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
