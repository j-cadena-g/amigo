ALTER TABLE `recurring_transactions` ADD `account_id` text REFERENCES `financial_accounts`(`id`) ON DELETE SET NULL;
