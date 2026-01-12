import {
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { households } from "./households";
import { users } from "./users";
import { currencyEnum } from "./currencies";

export const assetTypeEnum = pgEnum("asset_type", [
  "BANK",
  "INVESTMENT",
  "CASH",
  "PROPERTY",
]);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  // Denormalized user info for display when user is deleted
  userDisplayName: text("user_display_name"),
  // Track original creator when data is transferred during "fresh start" restore
  transferredFromUserId: uuid("transferred_from_user_id").references(
    () => users.id,
    { onDelete: "set null" }
  ),
  name: text("name").notNull(),
  type: assetTypeEnum("type").notNull(),
  balance: numeric("balance", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  currency: currencyEnum("currency").notNull().default("CAD"),
  // Exchange rate to home currency at time of last update (null if same as home currency)
  exchangeRateToHome: numeric("exchange_rate_to_home", { precision: 18, scale: 8 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
