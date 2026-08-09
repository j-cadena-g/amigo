CREATE TABLE `household_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`code_display` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`invited_email` text,
	`email_sent_at` integer,
	`email_last_error` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`used_by_user_id` text,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`used_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_invites_code_hash_unique` ON `household_invites` (`code_hash`);
--> statement-breakpoint
CREATE INDEX `household_invites_household_id_idx` ON `household_invites` (`household_id`);
--> statement-breakpoint
CREATE INDEX `household_invites_household_pending_idx` ON `household_invites` (`household_id`,`expires_at`);
