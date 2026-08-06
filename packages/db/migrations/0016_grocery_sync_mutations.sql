CREATE TABLE `grocery_sync_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`grocery_item_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`grocery_item_id`) REFERENCES `grocery_items`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `grocery_sync_mutations_household_id_idx` ON `grocery_sync_mutations` (`household_id`);
