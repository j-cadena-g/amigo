-- Issue #67: dedupe sibling category names before adding unique index.
CREATE TABLE `__fc_dedupe_map` (
	`duplicate_id` text PRIMARY KEY NOT NULL,
	`keeper_id` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__fc_dedupe_map` (`duplicate_id`, `keeper_id`)
SELECT
	fc.id,
	keepers.keeper_id
FROM `financial_categories` fc
INNER JOIN (
	SELECT
		fc1.household_id,
		COALESCE(fc1.parent_id, '') AS parent_key,
		fc1.type AS type,
		lower(fc1.name) AS name_key,
		(
			SELECT fc2.id
			FROM `financial_categories` fc2
			WHERE fc2.deleted_at IS NULL
				AND fc2.household_id = fc1.household_id
				AND COALESCE(fc2.parent_id, '') = COALESCE(fc1.parent_id, '')
				AND fc2.type = fc1.type
				AND lower(fc2.name) = lower(fc1.name)
			ORDER BY fc2.archived ASC, fc2.id ASC
			LIMIT 1
		) AS keeper_id
	FROM `financial_categories` fc1
	WHERE fc1.deleted_at IS NULL
	GROUP BY
		fc1.household_id,
		COALESCE(fc1.parent_id, ''),
		fc1.type,
		lower(fc1.name)
) keepers
	ON fc.household_id = keepers.household_id
	AND COALESCE(fc.parent_id, '') = keepers.parent_key
	AND fc.type = keepers.type
	AND lower(fc.name) = keepers.name_key
WHERE fc.deleted_at IS NULL
	AND fc.id != keepers.keeper_id;
--> statement-breakpoint
UPDATE `transactions`
SET `category_id` = (
	SELECT keeper_id
	FROM `__fc_dedupe_map`
	WHERE duplicate_id = `transactions`.`category_id`
)
WHERE `category_id` IN (SELECT duplicate_id FROM `__fc_dedupe_map`);
--> statement-breakpoint
UPDATE `recurring_transactions`
SET `category_id` = (
	SELECT keeper_id
	FROM `__fc_dedupe_map`
	WHERE duplicate_id = `recurring_transactions`.`category_id`
)
WHERE `category_id` IN (SELECT duplicate_id FROM `__fc_dedupe_map`);
--> statement-breakpoint
UPDATE `financial_categories`
SET `parent_id` = (
	SELECT keeper_id
	FROM `__fc_dedupe_map`
	WHERE duplicate_id = `financial_categories`.`parent_id`
)
WHERE `parent_id` IN (SELECT duplicate_id FROM `__fc_dedupe_map`);
--> statement-breakpoint
UPDATE `budget_category_mappings`
SET `category_id` = (
	SELECT keeper_id
	FROM `__fc_dedupe_map`
	WHERE duplicate_id = `budget_category_mappings`.`category_id`
)
WHERE `category_id` IN (
	SELECT m.duplicate_id
	FROM `__fc_dedupe_map` m
	WHERE NOT EXISTS (
		SELECT 1
		FROM `budget_category_mappings` bcm
		WHERE bcm.category_id = m.keeper_id
	)
);
--> statement-breakpoint
DELETE FROM `budget_category_mappings`
WHERE `category_id` IN (SELECT duplicate_id FROM `__fc_dedupe_map`);
--> statement-breakpoint
DELETE FROM `financial_categories`
WHERE `id` IN (SELECT duplicate_id FROM `__fc_dedupe_map`);
--> statement-breakpoint
DROP TABLE `__fc_dedupe_map`;
--> statement-breakpoint
-- Issue #66: remove cross-household references before composite FKs.
UPDATE `financial_categories`
SET `parent_id` = NULL
WHERE `parent_id` IS NOT NULL
	AND EXISTS (
		SELECT 1
		FROM `financial_categories` parent
		WHERE parent.id = `financial_categories`.`parent_id`
			AND parent.household_id != `financial_categories`.`household_id`
	);
--> statement-breakpoint
DELETE FROM `budget_category_mappings`
WHERE NOT EXISTS (
		SELECT 1
		FROM `budgets` b
		WHERE b.id = `budget_category_mappings`.`budget_id`
			AND b.household_id = `budget_category_mappings`.`household_id`
	)
	OR NOT EXISTS (
		SELECT 1
		FROM `financial_categories` fc
		WHERE fc.id = `budget_category_mappings`.`category_id`
			AND fc.household_id = `budget_category_mappings`.`household_id`
	);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_household_id_id_unique` ON `budgets` (`household_id`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_categories_household_id_id_unique` ON `financial_categories` (`household_id`, `id`);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_financial_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`household_id`, `parent_id`) REFERENCES `financial_categories`(`household_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_financial_categories` (
	`id`,
	`household_id`,
	`parent_id`,
	`name`,
	`type`,
	`icon`,
	`sort_order`,
	`archived`,
	`created_at`,
	`updated_at`,
	`deleted_at`
)
SELECT
	`id`,
	`household_id`,
	`parent_id`,
	`name`,
	`type`,
	`icon`,
	`sort_order`,
	`archived`,
	`created_at`,
	`updated_at`,
	`deleted_at`
FROM `financial_categories`;
--> statement-breakpoint
DROP TABLE `financial_categories`;
--> statement-breakpoint
ALTER TABLE `__new_financial_categories` RENAME TO `financial_categories`;
--> statement-breakpoint
CREATE INDEX `financial_categories_household_id_idx` ON `financial_categories` (`household_id`);
--> statement-breakpoint
CREATE INDEX `financial_categories_household_parent_idx` ON `financial_categories` (`household_id`, `parent_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_categories_household_id_id_unique` ON `financial_categories` (`household_id`, `id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_budget_category_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`budget_id` text NOT NULL,
	`category_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`household_id`, `budget_id`) REFERENCES `budgets`(`household_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`household_id`, `category_id`) REFERENCES `financial_categories`(`household_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_budget_category_mappings` (
	`id`,
	`household_id`,
	`budget_id`,
	`category_id`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`household_id`,
	`budget_id`,
	`category_id`,
	`created_at`,
	`updated_at`
FROM `budget_category_mappings`;
--> statement-breakpoint
DROP TABLE `budget_category_mappings`;
--> statement-breakpoint
ALTER TABLE `__new_budget_category_mappings` RENAME TO `budget_category_mappings`;
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_category_mappings_category_id_unique` ON `budget_category_mappings` (`category_id`);
--> statement-breakpoint
CREATE INDEX `budget_category_mappings_household_id_idx` ON `budget_category_mappings` (`household_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_categories_sibling_name_unique` ON `financial_categories` (
	`household_id`,
	COALESCE(`parent_id`, ''),
	`type`,
	lower(`name`)
)
WHERE `deleted_at` IS NULL;
