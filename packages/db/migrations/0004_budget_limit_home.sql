ALTER TABLE `budgets` ADD `limit_amount_home` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `exchange_rate_limit_to_home` real;--> statement-breakpoint
UPDATE `budgets` SET `limit_amount_home` = `limit_amount`;