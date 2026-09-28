-- Liabilities on financial_accounts: credit limit (CREDIT), original amount (LOAN),
-- and the same member-departure columns debts and assets carry.
ALTER TABLE `financial_accounts` ADD `user_display_name` text;--> statement-breakpoint
ALTER TABLE `financial_accounts` ADD `transferred_from_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_accounts` ADD `credit_limit` integer;--> statement-breakpoint
ALTER TABLE `financial_accounts` ADD `original_amount` integer;