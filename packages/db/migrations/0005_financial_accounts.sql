CREATE TABLE `financial_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`type` text DEFAULT 'CASH' NOT NULL,
	`currency` text DEFAULT 'CAD' NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`exchange_rate_to_home` real,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `financial_accounts_household_id_idx` ON `financial_accounts` (`household_id`);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `account_id` text REFERENCES `financial_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `posted_at` integer;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `external_id` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_batch_id` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `reviewed` integer DEFAULT 0 NOT NULL;
