CREATE TABLE `merchant_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`merchant_key` text NOT NULL,
	`display_name` text,
	`category_id` text,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `financial_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_aliases_household_merchant_key_unique` ON `merchant_aliases` (`household_id`,`merchant_key`);