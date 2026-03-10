import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  operation: text("operation").notNull(), // INSERT, UPDATE, DELETE
  oldValues: text("old_values", { mode: "json" }),
  newValues: text("new_values", { mode: "json" }),
  changedBy: text("changed_by"), // auth_id of the user
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
