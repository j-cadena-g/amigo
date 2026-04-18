PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`operation` text NOT NULL,
	`old_values` text,
	`new_values` text,
	`changed_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_audit_logs`("id", "household_id", "table_name", "record_id", "operation", "old_values", "new_values", "changed_by", "created_at") SELECT "id", "household_id", "table_name", "record_id", "operation", "old_values", "new_values", "changed_by", "created_at" FROM `audit_logs`;--> statement-breakpoint
DROP TABLE `audit_logs`;--> statement-breakpoint
ALTER TABLE `__new_audit_logs` RENAME TO `audit_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `audit_logs_household_id_idx` ON `audit_logs` (`household_id`);--> statement-breakpoint
CREATE INDEX `transactions_household_id_idx` ON `transactions` (`household_id`);--> statement-breakpoint
CREATE INDEX `grocery_items_household_id_idx` ON `grocery_items` (`household_id`);--> statement-breakpoint
CREATE INDEX `grocery_tags_household_id_idx` ON `grocery_tags` (`household_id`);--> statement-breakpoint
CREATE INDEX `budgets_household_id_idx` ON `budgets` (`household_id`);--> statement-breakpoint
CREATE INDEX `debts_household_id_idx` ON `debts` (`household_id`);--> statement-breakpoint
CREATE INDEX `assets_household_id_idx` ON `assets` (`household_id`);--> statement-breakpoint
CREATE INDEX `recurring_transactions_household_id_idx` ON `recurring_transactions` (`household_id`);