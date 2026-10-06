import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pushSubscriptions } from "./push-subscriptions";
import { transactions } from "./transactions";

/** One delivery per explicit transaction reminder and device, guarded by a lease. */
export const transactionReminderDeliveries = sqliteTable(
  "transaction_reminder_deliveries",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    reminderAt: integer("reminder_at", { mode: "timestamp_ms" }).notNull(),
    leaseUntil: integer("lease_until", { mode: "timestamp_ms" }).notNull(),
    deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("transaction_reminder_deliveries_subscription_id_idx").on(table.subscriptionId),
    index("transaction_reminder_deliveries_transaction_id_idx").on(table.transactionId),
  ]
);

export type TransactionReminderDelivery = typeof transactionReminderDeliveries.$inferSelect;
export type NewTransactionReminderDelivery = typeof transactionReminderDeliveries.$inferInsert;
