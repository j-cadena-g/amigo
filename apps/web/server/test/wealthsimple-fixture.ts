// Synthetic Wealthsimple column layout; no customer values.
export const csvHeaders =
  "effective_date,effective_time,settlement_date,account_id,account_type,activity_type,activity_sub_type,description,direction,symbol,name,currency,quantity,unit_price,commission,net_cash_amount";
export function csvRow(overrides: Record<string, string> = {}): string {
  const values: Record<string, string> = {
    effective_date: "2026-09-20",
    effective_time: "12:30:00",
    account_id: "synthetic-account",
    account_type: "Chequing",
    activity_type: "MoneyMovement",
    activity_sub_type: "SPEND",
    description: "Example café",
    currency: "CAD",
    net_cash_amount: "-12.34",
    ...overrides,
  };
  return csvHeaders
    .split(",")
    .map((key) => `"${(values[key] ?? "").replaceAll('"', '""')}"`)
    .join(",");
}
export const csvStatement = (...rows: string[]) =>
  csvHeaders + "\r\n" + (rows.length ? rows : [csvRow()]).join("\r\n");
