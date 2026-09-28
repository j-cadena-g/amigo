-- Move credit cards, loans and legacy assets into financial_accounts.
-- Ids are kept. Liability balances are stored negative (what the account is worth
-- to the household): owed = balance_initial - balance_current for both debt kinds.
-- debts and assets are left untouched; a later migration re-runs this copy and drops them.
-- Idempotent: rows whose id already exists in financial_accounts are skipped.

INSERT INTO financial_accounts (
  id,
  household_id,
  user_id,
  name,
  type,
  currency,
  balance,
  credit_limit,
  original_amount,
  exchange_rate_to_home,
  archived,
  user_display_name,
  transferred_from_user_id,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  d.id,
  d.household_id,
  d.user_id,
  d.name,
  CASE d.type WHEN 'CREDIT_CARD' THEN 'CREDIT' ELSE 'LOAN' END,
  d.currency,
  d.balance_current - d.balance_initial,
  CASE WHEN d.type = 'CREDIT_CARD' THEN d.balance_initial END,
  CASE WHEN d.type = 'LOAN' THEN d.balance_initial END,
  d.exchange_rate_to_home,
  0,
  d.user_display_name,
  d.transferred_from_user_id,
  d.created_at,
  d.updated_at,
  d.deleted_at
FROM debts d
WHERE d.type IN ('CREDIT_CARD', 'LOAN')
  AND NOT EXISTS (SELECT 1 FROM financial_accounts fa WHERE fa.id = d.id);
--> statement-breakpoint
-- Live legacy assets only. Deleted ones were converted or removed already; also skip
-- any live asset whose convert-endpoint account (from-asset-<id>) already exists.
INSERT INTO financial_accounts (
  id,
  household_id,
  user_id,
  name,
  type,
  currency,
  balance,
  exchange_rate_to_home,
  archived,
  user_display_name,
  transferred_from_user_id,
  created_at,
  updated_at
)
SELECT
  a.id,
  a.household_id,
  a.user_id,
  a.name,
  CASE a.type WHEN 'BANK' THEN 'CHECKING' ELSE a.type END,
  a.currency,
  a.balance,
  a.exchange_rate_to_home,
  0,
  a.user_display_name,
  a.transferred_from_user_id,
  a.created_at,
  a.updated_at
FROM assets a
WHERE a.deleted_at IS NULL
  AND a.type IN ('BANK', 'INVESTMENT', 'CASH', 'PROPERTY')
  AND NOT EXISTS (SELECT 1 FROM financial_accounts fa WHERE fa.id = a.id)
  AND NOT EXISTS (SELECT 1 FROM financial_accounts fa WHERE fa.id = 'from-asset-' || a.id);
--> statement-breakpoint
-- Retire the copied assets the way the convert endpoint does, so a code revert can't
-- show the same money twice (legacy section + account).
UPDATE assets
SET deleted_at = CAST(unixepoch() * 1000 AS INTEGER)
WHERE deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM financial_accounts fa
    WHERE fa.id = assets.id OR fa.id = 'from-asset-' || assets.id
  );
