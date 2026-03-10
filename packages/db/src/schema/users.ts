import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { households } from "./households";

export const USER_ROLES = ["owner", "admin", "member"] as const;

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
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = (typeof USER_ROLES)[number];
