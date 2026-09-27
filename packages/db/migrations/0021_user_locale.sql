-- Per-user number and date format. The generated snapshot also records the
-- recurring_transactions.deleted_at column and index that 0019 added by hand.
ALTER TABLE `users` ADD `locale` text;
