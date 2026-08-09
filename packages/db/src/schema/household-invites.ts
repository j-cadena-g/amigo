import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { households } from "./households";
import { users } from "./users";

export const householdInvites = sqliteTable(
  "household_invites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    codeDisplay: text("code_display").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedEmail: text("invited_email"),
    emailSentAt: integer("email_sent_at", { mode: "timestamp_ms" }),
    emailLastError: text("email_last_error"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    usedByUserId: text("used_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("household_invites_code_hash_unique").on(table.codeHash),
    index("household_invites_household_id_idx").on(table.householdId),
    index("household_invites_household_pending_idx").on(
      table.householdId,
      table.expiresAt
    ),
  ]
);

export type HouseholdInvite = typeof householdInvites.$inferSelect;
export type NewHouseholdInvite = typeof householdInvites.$inferInsert;
