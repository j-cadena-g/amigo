-- Backfill financial categories from existing transaction and budget strings.
-- Seed starter categories for households with no categories yet.

INSERT INTO financial_categories (
  id,
  household_id,
  parent_id,
  name,
  type,
  sort_order,
  archived,
  created_at,
  updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))),
  household_id,
  NULL,
  category_name,
  category_type,
  0,
  0,
  CAST(unixepoch() * 1000 AS INTEGER),
  CAST(unixepoch() * 1000 AS INTEGER)
FROM (
  SELECT DISTINCT
    t.household_id AS household_id,
    trim(t.category) AS category_name,
    t.type AS category_type
  FROM transactions t
  WHERE t.deleted_at IS NULL
    AND trim(t.category) != ''
  UNION
  SELECT DISTINCT
    r.household_id AS household_id,
    trim(r.category) AS category_name,
    r.type AS category_type
  FROM recurring_transactions r
  WHERE trim(r.category) != ''
)
WHERE NOT EXISTS (
  SELECT 1
  FROM financial_categories fc
  WHERE fc.household_id = household_id
    AND fc.deleted_at IS NULL
    AND lower(fc.name) = lower(category_name)
    AND fc.type = category_type
    AND fc.parent_id IS NULL
);
--> statement-breakpoint
UPDATE transactions
SET category_id = (
  SELECT fc.id
  FROM financial_categories fc
  WHERE fc.household_id = transactions.household_id
    AND fc.deleted_at IS NULL
    AND fc.parent_id IS NULL
    AND fc.type = transactions.type
    AND lower(fc.name) = lower(trim(transactions.category))
  LIMIT 1
)
WHERE category_id IS NULL
  AND trim(category) != '';
--> statement-breakpoint
UPDATE recurring_transactions
SET category_id = (
  SELECT fc.id
  FROM financial_categories fc
  WHERE fc.household_id = recurring_transactions.household_id
    AND fc.deleted_at IS NULL
    AND fc.parent_id IS NULL
    AND fc.type = recurring_transactions.type
    AND lower(fc.name) = lower(trim(recurring_transactions.category))
  LIMIT 1
)
WHERE category_id IS NULL
  AND trim(category) != '';
--> statement-breakpoint
INSERT INTO budget_category_mappings (
  id,
  household_id,
  budget_id,
  category_id,
  created_at,
  updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))),
  picks.household_id,
  picks.budget_id,
  picks.category_id,
  CAST(unixepoch() * 1000 AS INTEGER),
  CAST(unixepoch() * 1000 AS INTEGER)
FROM (
  SELECT
    b.household_id,
    MIN(b.id) AS budget_id,
    fc.id AS category_id
  FROM budgets b
  INNER JOIN financial_categories fc
    ON fc.household_id = b.household_id
    AND fc.deleted_at IS NULL
    AND fc.parent_id IS NULL
    AND fc.type = 'expense'
    AND lower(fc.name) = lower(trim(b.category))
  WHERE b.deleted_at IS NULL
    AND b.category IS NOT NULL
    AND trim(b.category) != ''
  GROUP BY b.household_id, fc.id
) AS picks
WHERE NOT EXISTS (
  SELECT 1
  FROM budget_category_mappings m
  WHERE m.category_id = picks.category_id
);
--> statement-breakpoint
INSERT INTO financial_categories (
  id,
  household_id,
  parent_id,
  name,
  type,
  sort_order,
  archived,
  created_at,
  updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))),
  h.id,
  NULL,
  starter.name,
  'expense',
  starter.sort_order,
  0,
  CAST(unixepoch() * 1000 AS INTEGER),
  CAST(unixepoch() * 1000 AS INTEGER)
FROM households h
CROSS JOIN (
  SELECT 'Groceries' AS name, 0 AS sort_order
  UNION ALL SELECT 'Living expenses', 1
  UNION ALL SELECT 'Subscriptions', 2
) AS starter
WHERE NOT EXISTS (
  SELECT 1
  FROM financial_categories fc
  WHERE fc.household_id = h.id
    AND fc.deleted_at IS NULL
);
