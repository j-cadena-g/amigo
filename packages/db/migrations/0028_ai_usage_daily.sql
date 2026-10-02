CREATE TABLE `ai_usage_daily` (
	`day` text NOT NULL,
	`feature` text NOT NULL,
	`neurons` real DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`day`, `feature`)
);
