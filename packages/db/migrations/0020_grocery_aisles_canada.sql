-- Rename grocery aisles to the department names Real Canadian Superstore,
-- Sobeys, and Metro use. Aisles that kept their names, and the new aisles,
-- need no backfill. updated_at stays as is: the item itself did not change.
UPDATE `grocery_items` SET `category` = 'Fruits & Vegetables' WHERE `category` = 'Produce';
--> statement-breakpoint
UPDATE `grocery_items` SET `category` = 'Dairy & Eggs' WHERE `category` = 'Dairy';
--> statement-breakpoint
UPDATE `grocery_items` SET `category` = 'Fish & Seafood' WHERE `category` = 'Seafood';
