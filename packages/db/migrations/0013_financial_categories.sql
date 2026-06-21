CREATE TABLE `financial_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`parent_id`) REFERENCES `financial_categories`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `financial_categories_household_id_idx` ON `financial_categories` (`household_id`);
--> statement-breakpoint
CREATE INDEX `financial_categories_household_parent_idx` ON `financial_categories` (`household_id`,`parent_id`);
--> statement-breakpoint
CREATE TABLE `budget_category_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`budget_id` text NOT NULL,
	`category_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`category_id`) REFERENCES `financial_categories`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_category_mappings_category_id_unique` ON `budget_category_mappings` (`category_id`);
--> statement-breakpoint
CREATE INDEX `budget_category_mappings_household_id_idx` ON `budget_category_mappings` (`household_id`);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `category_id` text REFERENCES `financial_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE `recurring_transactions` ADD `category_id` text REFERENCES `financial_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
