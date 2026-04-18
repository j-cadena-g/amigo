-- Existing audit_logs rows receive household_id = '' via DEFAULT.
-- If production has pre-change audit history that must stay tenant-scoped in the app,
-- run a one-off backfill (joining record_id to the owning row) before relying on
-- household_id filters for those legacy rows.
ALTER TABLE `audit_logs` ADD `household_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `audit_logs`
SET `household_id` = CASE
  WHEN `table_name` = 'transactions' THEN COALESCE(
    (SELECT `household_id` FROM `transactions` WHERE `transactions`.`id` = `audit_logs`.`record_id`),
    `household_id`
  )
  WHEN `table_name` = 'grocery_items' THEN COALESCE(
    (SELECT `household_id` FROM `grocery_items` WHERE `grocery_items`.`id` = `audit_logs`.`record_id`),
    `household_id`
  )
  ELSE `household_id`
END
WHERE `household_id` = '';
--> statement-breakpoint
CREATE INDEX `audit_logs_household_id_idx` ON `audit_logs` (`household_id`);
