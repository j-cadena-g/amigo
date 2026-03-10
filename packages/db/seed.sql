-- Seed data for local development
-- Run with: bun run db:seed:local

INSERT INTO households (id, clerk_org_id, name, home_currency, created_at, updated_at)
VALUES ('hh-seed-001', 'org_seed_001', 'Demo Household', 'CAD', 1709942400000, 1709942400000);

INSERT INTO users (id, auth_id, email, name, household_id, role, created_at, updated_at)
VALUES ('user-seed-001', 'clerk_dev_user', 'dev@example.com', 'Dev User', 'hh-seed-001', 'owner', 1709942400000, 1709942400000);

INSERT INTO grocery_tags (id, household_id, name, color, created_at, updated_at)
VALUES
  ('tag-seed-001', 'hh-seed-001', 'Costco', 'blue', 1709942400000, 1709942400000),
  ('tag-seed-002', 'hh-seed-001', 'Superstore', 'green', 1709942400000, 1709942400000);

INSERT INTO grocery_items (id, household_id, created_by_user_id, item_name, category, is_purchased, created_at, updated_at)
VALUES
  ('gi-seed-001', 'hh-seed-001', 'user-seed-001', 'Milk', 'Dairy', 0, 1709942400000, 1709942400000),
  ('gi-seed-002', 'hh-seed-001', 'user-seed-001', 'Bread', 'Bakery', 0, 1709942400000, 1709942400000),
  ('gi-seed-003', 'hh-seed-001', 'user-seed-001', 'Eggs', 'Dairy', 0, 1709942400000, 1709942400000);

INSERT INTO budgets (id, household_id, user_id, name, category, limit_amount, currency, period, created_at, updated_at)
VALUES
  ('budget-seed-001', 'hh-seed-001', NULL, 'Groceries', 'groceries', 60000, 'CAD', 'monthly', 1709942400000, 1709942400000),
  ('budget-seed-002', 'hh-seed-001', NULL, 'Dining Out', 'dining', 20000, 'CAD', 'monthly', 1709942400000, 1709942400000);

INSERT INTO transactions (id, household_id, user_id, amount, currency, category, description, type, date, created_at, updated_at)
VALUES
  ('tx-seed-001', 'hh-seed-001', 'user-seed-001', 4599, 'CAD', 'groceries', 'Weekly groceries', 'expense', '2026-03-01', 1709942400000, 1709942400000),
  ('tx-seed-002', 'hh-seed-001', 'user-seed-001', 2150, 'CAD', 'dining', 'Coffee shop', 'expense', '2026-03-02', 1709942400000, 1709942400000),
  ('tx-seed-003', 'hh-seed-001', 'user-seed-001', 500000, 'CAD', 'income', 'Salary', 'income', '2026-03-01', 1709942400000, 1709942400000);
