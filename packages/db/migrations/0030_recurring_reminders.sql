CREATE TABLE `recurring_reminder_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`reminder_date` text NOT NULL,
	`lease_until` integer NOT NULL,
	`delivered_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recurring_reminder_deliveries_subscription_id_idx` ON `recurring_reminder_deliveries` (`subscription_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `grocery_notifications` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `recurring_notifications` integer DEFAULT false NOT NULL;