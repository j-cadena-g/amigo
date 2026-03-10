import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { CURRENCY_CODES } from "./currencies";

export const households = sqliteTable("households", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  homeCurrency: text("home_currency", { enum: CURRENCY_CODES })
    .notNull()
    .default("CAD"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export type Household = typeof households.$inferSelect;
export type NewHousehold = typeof households.$inferInsert;
