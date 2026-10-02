ALTER TABLE `transactions` ADD `bank_description` text;--> statement-breakpoint
UPDATE transactions SET bank_description = description WHERE bank_description IS NULL AND (external_id LIKE 'ofx:%' OR external_id LIKE 'wealthsimple:%');
