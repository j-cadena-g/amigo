import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { households } from "./households";

export const USER_ROLES = ["owner", "admin", "member"] as const;

/** Number and date formats a user can choose; labels live in the web app. */
export const FORMAT_LOCALES = [
  "en-CA",
  "en-US",
  "en-GB",
  "fr-CA",
  "es-CO",
  "es-MX",
  "es-ES",
  "de-DE",
] as const;

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  authId: text("auth_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  role: text("role", { enum: USER_ROLES }).notNull().default("member"),
  /**
   * BCP 47 tag for number and date formatting, e.g. "es-CO". Null follows the
   * household's currency and the browser's language.
   */
  locale: text("locale", { enum: FORMAT_LOCALES }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  restoreAllowedUntil: integer("restore_allowed_until", { mode: "timestamp_ms" }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = (typeof USER_ROLES)[number];
export type FormatLocale = (typeof FORMAT_LOCALES)[number];
