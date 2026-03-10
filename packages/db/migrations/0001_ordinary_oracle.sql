ALTER TABLE `households` ADD `clerk_org_id` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `households_clerk_org_id_unique` ON `households` (`clerk_org_id`);