ALTER TABLE `recurring_transactions` ADD `deleted_at` integer;
--> statement-breakpoint
CREATE INDEX `recurring_transactions_household_deleted_idx` ON `recurring_transactions` (`household_id`, `deleted_at`);
