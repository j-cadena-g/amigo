import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pushSubscriptions } from "./push-subscriptions";

/** One selected occurrence reminder per device, with a lease for concurrent jobs. */
export const recurringReminderDeliveries = sqliteTable(
  "recurring_reminder_deliveries",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    /** Occurrence calendar date; the deterministic id also includes rule and reminder instant. */
    reminderDate: text("reminder_date").notNull(),
    leaseUntil: integer("lease_until", { mode: "timestamp_ms" }).notNull(),
    deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("recurring_reminder_deliveries_subscription_id_idx").on(table.subscriptionId)]
);

export type RecurringReminderDelivery = typeof recurringReminderDeliveries.$inferSelect;
export type NewRecurringReminderDelivery = typeof recurringReminderDeliveries.$inferInsert;
