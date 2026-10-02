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
