import { CURRENCY_CODES, type CurrencyCode } from "@amigo/db";
import { MAX_OFX_BYTES, type OfxRow } from "./ofx";

/** RFC 4180-style records, including quoted commas, newlines and escaped quotes. */
function records(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += ch;
    } else if (ch === "," || ch === "\n" || ch === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (ch !== ",") {
        if (row.some((value) => value !== "")) result.push(row);
        row = [];
        if (ch === "\r" && text[i + 1] === "\n") i++;
      }
    } else if (ch === '"' && cell === "" && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw new Error("Malformed CSV quoting.");
      cell += ch;
    }
    if (result.length > 2001)
      throw new Error("CSV files support at most 2,000 transactions.");
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  row.push(cell);
  if (row.some((value) => value !== "")) result.push(row);
  return result;
}

export async function parseWealthsimpleCsv(
  source: string
): Promise<{ rows: OfxRow[]; creditCard: boolean }> {
  if (new TextEncoder().encode(source).length > MAX_OFX_BYTES)
    throw new Error("CSV files must be under 2 MB.");
  const [headers, ...data] = records(source.replace(/^\uFEFF/, ""));
  const required = [
    "effective_date",
    "effective_time",
    "account_id",
    "account_type",
    "activity_type",
    "activity_sub_type",
    "description",
    "currency",
    "net_cash_amount",
  ];
  if (
    !headers ||
    new Set(headers).size !== headers.length ||
    required.some((key) => !headers.includes(key))
  )
    throw new Error(
      "Choose a Wealthsimple activity CSV with the original column headers."
    );
  if (!data.length || data.length > 2000)
    throw new Error("CSV files must contain 1–2,000 transactions.");
  const accounts = new Set<string>();
  const occurrences = new Map<string, number>();
  const rows: OfxRow[] = [];
  for (const cells of data) {
    if (cells.length !== headers.length)
      throw new Error("CSV row has an unexpected number of columns.");
    const record = Object.fromEntries(
      headers.map((key, i) => [key, cells[i]!.trim()])
    );
    const account = record.account_id!;
    if (!account) throw new Error("CSV account identity is missing.");
    accounts.add(account);
    if (accounts.size > 1)
      throw new Error("Choose a CSV containing one Wealthsimple account.");
    if (
      record.account_type !== "Chequing" ||
      !["MoneyMovement", "Interest"].includes(record.activity_type!)
    )
      throw new Error(
        "Only Wealthsimple Chequing cash activities are supported; investment trades are not transaction imports."
      );
    const date = record.effective_date!;
    const timestamp = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(timestamp.getTime()) ||
      timestamp.toISOString().slice(0, 10) !== date
    )
      throw new Error("Invalid CSV effective date.");
    const currency = record.currency!;
    if (!(CURRENCY_CODES as readonly string[]).includes(currency))
      throw new Error("Unsupported CSV currency.");
    const amount = record.net_cash_amount!;
    if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(amount))
      throw new Error("Invalid CSV cash amount.");
    const [whole, decimal = ""] = amount.replace(/^[+-]/, "").split(".");
    const amountCents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
    if (!Number.isSafeInteger(amountCents))
      throw new Error("CSV amount exceeds the supported range.");
    const description = record.description!;
    if (description.length > 500)
      throw new Error("CSV description exceeds 500 characters.");
    const type = amount.startsWith("-") ? "expense" : "income";
    // No bank transaction IDs: content matches are only possible duplicates.
    // An occurrence counter preserves multiple identical legitimate rows in one export.
    const identity = JSON.stringify([
      account,
      date,
      record.effective_time,
      record.activity_type,
      record.activity_sub_type,
      description,
      currency,
      type,
      amountCents,
    ]);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(identity)
    );
    const hash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    rows.push({
      date,
      type,
      amountCents,
      description,
      currency: currency as CurrencyCode,
      externalId: `wealthsimple:${hash}:${occurrence}`,
      category: "Uncategorized",
      defaultExcluded:
        amountCents === 0 ||
        type === "income" ||
        record.activity_sub_type!.startsWith("TRANSFER"),
    });
  }
  return { rows, creditCard: false };
}
