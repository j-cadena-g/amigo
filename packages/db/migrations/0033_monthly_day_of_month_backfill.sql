-- Monthly rules saved without day_of_month drifted after a short month
-- (Jan 31 → Feb 28 → Mar 28). Anchor them to their start date's day, which is
-- what the API now stores for new monthly rules. The next posting re-anchors
-- next_run_date (Mar 28 + 1 month with day 31 → Apr 30).
UPDATE `recurring_transactions`
SET `day_of_month` = CAST(strftime('%d', `start_date`) AS INTEGER)
WHERE `frequency` = 'MONTHLY'
  AND `day_of_month` IS NULL;
