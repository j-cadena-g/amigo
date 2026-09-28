-- What the card or bank actually charged for a transaction (fees and its own
-- rate included) in its own currency, plus that currency's FX snapshot to home.
ALTER TABLE `transactions` ADD `charged_amount` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `charged_currency` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `charged_exchange_rate_to_home` real;
