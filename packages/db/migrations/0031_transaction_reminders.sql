CREATE TABLE `transaction_reminder_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`reminder_at` integer NOT NULL,
	`lease_until` integer NOT NULL,
	`delivered_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transaction_reminder_deliveries_subscription_id_idx` ON `transaction_reminder_deliveries` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `transaction_reminder_deliveries_transaction_id_idx` ON `transaction_reminder_deliveries` (`transaction_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `transaction_notifications` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `reminder_times` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `reminder_user_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `transactions_reminder_user_id_idx` ON `transactions` (`reminder_user_id`) WHERE "transactions"."reminder_user_id" IS NOT NULL AND "transactions"."deleted_at" IS NULL;