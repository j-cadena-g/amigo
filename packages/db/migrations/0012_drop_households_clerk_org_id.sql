DROP INDEX IF EXISTS `households_clerk_org_id_unique`;--> statement-breakpoint
ALTER TABLE `households` DROP COLUMN `clerk_org_id`;
