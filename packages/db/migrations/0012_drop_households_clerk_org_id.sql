-- Production: backfill Clerk publicMetadata (householdId/householdName) from
-- households.clerk_org_id before applying this migration. Verify every household
-- owner can resolve a session after the backfill, then run db:migrate:remote.
DROP INDEX IF EXISTS `households_clerk_org_id_unique`;--> statement-breakpoint
ALTER TABLE `households` DROP COLUMN `clerk_org_id`;
