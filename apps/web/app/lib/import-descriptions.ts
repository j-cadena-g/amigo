/** A blank choice is Uncategorized, same as an explicit null. */
function chosenCategory(
  suggestion: string | null,
  choices: ReadonlyMap<string, string | null>,
  externalId: string
): string | null {
  if (!choices.has(externalId)) return suggestion;
  const choice = choices.get(externalId);
  return choice ? choice : null;
}

/** Final category per included editable row, for the confirm request. */
export function chosenCategories(
  rows: { externalId: string; categoryId: string | null }[],
  choices: ReadonlyMap<string, string | null>,
  excluded: ReadonlySet<string>,
  editable: (externalId: string) => boolean
): Record<string, string | null> {
  const categories: Record<string, string | null> = {};
  for (const row of rows) {
    if (excluded.has(row.externalId) || !editable(row.externalId)) continue;
    categories[row.externalId] = chosenCategory(row.categoryId, choices, row.externalId);
  }
  return categories;
}

/**
 * Other included editable rows from the same merchant and of the same type
 * whose current category differs from the one just chosen.
 */
export function sameMerchantTargets(
  rows: {
    externalId: string;
    merchantKey: string | null;
    categoryId: string | null;
    type: "income" | "expense";
  }[],
  changedId: string,
  categoryId: string | null,
  choices: ReadonlyMap<string, string | null>,
  excluded: ReadonlySet<string>,
  editable: (externalId: string) => boolean
): string[] {
  const changed = rows.find((row) => row.externalId === changedId);
  if (!changed || changed.merchantKey == null) return [];
  const nextCategory = categoryId ? categoryId : null;
  const targets: string[] = [];
  for (const row of rows) {
    if (row.externalId === changedId || row.merchantKey !== changed.merchantKey) continue;
    // A refund from the same merchant can't take an expense category, or the reverse.
    if (row.type !== changed.type) continue;
    if (excluded.has(row.externalId) || !editable(row.externalId)) continue;
    const current = chosenCategory(row.categoryId, choices, row.externalId);
    if (current === nextCategory) continue;
    targets.push(row.externalId);
  }
  return targets;
}

/** Names the user changed on included preview rows, ready for the confirm request. */
export function editedDescriptions(
  rows: { externalId: string; description: string | null }[],
  edits: ReadonlyMap<string, string>,
  excluded: ReadonlySet<string>
): Record<string, string> {
  const descriptions: Record<string, string> = {};
  for (const row of rows) {
    if (excluded.has(row.externalId)) continue;
    const edit = edits.get(row.externalId);
    if (edit == null) continue;
    const trimmed = edit.trim();
    if (!trimmed || trimmed.length > 200 || trimmed === row.description) continue;
    descriptions[row.externalId] = trimmed;
  }
  return descriptions;
}
