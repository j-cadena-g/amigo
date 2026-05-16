-- Recompute limit_amount_home and exchange_rate_limit_to_home for budgets created before
-- accurate FX snapshots existed: use household home_currency and latest row in exchange_rates
-- (base = budget currency, target = home). Same-currency budgets copy `limit_amount`; with a rate,
-- converted home cents match `computeLimitAmountHomeCents` (positive limits never round to 0).
-- If the budget currency differs from home and no FX row exists, keep the prior
-- `limit_amount_home` (from migration 0004: copy of `limit_amount`) so NOT NULL is preserved.

WITH `fx` AS (
  SELECT
    `b`.`id` AS `budget_id`,
    `h`.`home_currency` AS `home_cur`,
    `b`.`currency` AS `b_cur`,
    `b`.`limit_amount` AS `lim`,
    (
      SELECT `er`.`rate`
      FROM `exchange_rates` AS `er`
      WHERE `er`.`base_currency` = `b`.`currency`
        AND `er`.`target_currency` = `h`.`home_currency`
      ORDER BY `er`.`date` DESC
      LIMIT 1
    ) AS `r`
  FROM `budgets` AS `b`
  INNER JOIN `households` AS `h` ON `h`.`id` = `b`.`household_id`
)
UPDATE `budgets`
SET
  `exchange_rate_limit_to_home` = CASE
    WHEN `fx`.`b_cur` = `fx`.`home_cur` THEN NULL
    ELSE `fx`.`r`
  END,
  `limit_amount_home` = CASE
    WHEN `fx`.`b_cur` = `fx`.`home_cur` THEN `fx`.`lim`
    WHEN `fx`.`r` IS NOT NULL THEN
      CASE
        WHEN `fx`.`lim` <= 0 THEN 0
        WHEN CAST(ROUND(CAST(`fx`.`lim` AS REAL) * `fx`.`r`) AS INTEGER) < 1 THEN 1
        ELSE CAST(ROUND(CAST(`fx`.`lim` AS REAL) * `fx`.`r`) AS INTEGER)
      END
    ELSE `budgets`.`limit_amount_home`
  END
FROM `fx`
WHERE `budgets`.`id` = `fx`.`budget_id`;
