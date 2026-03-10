import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    keys: text("keys", { mode: "json" })
      .$type<{
        p256dh: string;
        auth: string;
      }>()
      .notNull(),
    userAgent: text("user_agent"),
    lastPushAt: integer("last_push_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index("push_subscriptions_user_id_idx").on(table.userId)]
);

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [pushSubscriptions.userId],
      references: [users.id],
    }),
  })
);

// Relations for users (one-to-many with push_subscriptions)
// Defined here to avoid circular imports between users.ts and push-subscriptions.ts
export const usersRelations = relations(users, ({ many }) => ({
  pushSubscriptions: many(pushSubscriptions),
}));

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
