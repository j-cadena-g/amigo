ALTER TABLE `financial_categories` ADD `description` text;--> statement-breakpoint
-- Seeded starters only: the seed writes all three names at once, in order,
-- with one created_at. A household's own "Groceries" keeps a NULL description.
UPDATE financial_categories SET description = CASE name
  WHEN 'Groceries' THEN 'Supermarkets and grocery stores: food and household supplies for home.'
  WHEN 'Living expenses' THEN 'Running the home: rent or mortgage, utilities, phone and internet, insurance, transportation, and other everyday necessities.'
  WHEN 'Subscriptions' THEN 'Recurring digital services and memberships: streaming, software, apps, cloud storage, and news.'
  WHEN 'Mercado' THEN 'Supermercados y tiendas de barrio: comida y artículos para la casa.'
  WHEN 'Gastos del hogar' THEN 'Lo que cuesta mantener la casa: arriendo o renta, servicios públicos, teléfono e internet, seguros, transporte y otros gastos del día a día.'
  WHEN 'Suscripciones' THEN 'Servicios digitales y membresías que se cobran periódicamente: streaming, software, apps, almacenamiento en la nube y noticias.'
END
WHERE description IS NULL AND parent_id IS NULL AND type = 'expense' AND (
  (
    name || ':' || sort_order IN ('Groceries:0', 'Living expenses:1', 'Subscriptions:2')
    AND (
      SELECT count(DISTINCT starter.name)
      FROM financial_categories starter
      WHERE starter.household_id = financial_categories.household_id
        AND starter.created_at = financial_categories.created_at
        AND starter.parent_id IS NULL
        AND starter.type = 'expense'
        AND starter.name || ':' || starter.sort_order IN ('Groceries:0', 'Living expenses:1', 'Subscriptions:2')
    ) = 3
  )
  OR (
    name || ':' || sort_order IN ('Mercado:0', 'Gastos del hogar:1', 'Suscripciones:2')
    AND (
      SELECT count(DISTINCT starter.name)
      FROM financial_categories starter
      WHERE starter.household_id = financial_categories.household_id
        AND starter.created_at = financial_categories.created_at
        AND starter.parent_id IS NULL
        AND starter.type = 'expense'
        AND starter.name || ':' || starter.sort_order IN ('Mercado:0', 'Gastos del hogar:1', 'Suscripciones:2')
    ) = 3
  )
);
