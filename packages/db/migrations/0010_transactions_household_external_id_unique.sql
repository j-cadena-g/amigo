UPDATE `transactions`
SET `external_id` = NULL
WHERE `deleted_at` IS NOT NULL
  AND `external_id` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `transactions`
WHERE `external_id` IS NOT NULL
  AND rowid NOT IN (
    SELECT MIN(rowid)
    FROM `transactions`
    WHERE `external_id` IS NOT NULL
    GROUP BY `household_id`, `external_id`
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_household_external_id_unique` ON `transactions` (`household_id`, `external_id`);
