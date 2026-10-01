import { describe, expect, it } from "vitest";
import { parseWealthsimpleCsv } from "./wealthsimple-csv";
import { csvStatement, csvRow } from "../test/wealthsimple-fixture";

describe("Wealthsimple CSV", () => {
  it("reads BOM, quoted commas, escaped quotes and multiline descriptions", async () => {
    const description = 'Café, "Market"\nPurchase';
    const result = await parseWealthsimpleCsv(
      "\uFEFF" + csvStatement(csvRow({ description }))
    );
    expect(result.rows[0]).toMatchObject({
      description,
      amountCents: 1234,
      type: "expense",
      currency: "CAD",
    });
  });
  it("preserves identical legitimate rows and stable identities across overlapping downloads", async () => {
    const a = await parseWealthsimpleCsv(csvStatement(csvRow(), csvRow()));
    expect(a.rows[0]!.externalId).not.toBe(a.rows[1]!.externalId);
    const b = await parseWealthsimpleCsv(
      csvStatement(csvRow(), csvRow({ description: "Other purchase" }))
    );
    expect(a.rows[0]!.externalId).toBe(b.rows[0]!.externalId);
  });
  it("namespaces by source account and normalizes decimal formatting", async () => {
    const a = (
      await parseWealthsimpleCsv(
        csvStatement(csvRow({ net_cash_amount: "-12.3" }))
      )
    ).rows[0]!;
    const b = (
      await parseWealthsimpleCsv(
        csvStatement(csvRow({ net_cash_amount: "-12.30" }))
      )
    ).rows[0]!;
    const c = (
      await parseWealthsimpleCsv(csvStatement(csvRow({ account_id: "other" })))
    ).rows[0]!;
    expect(a.externalId).toBe(b.externalId);
    expect(a.externalId).not.toBe(c.externalId);
  });
  it("leaves transfers, credits, and zero cash activities unchecked", async () => {
    const { rows } = await parseWealthsimpleCsv(
      csvStatement(
        csvRow({ activity_sub_type: "TRANSFER" }),
        csvRow({ net_cash_amount: "0" }),
        csvRow({ activity_type: "Interest", net_cash_amount: "1.23" })
      )
    );
    expect(rows.every((row) => row.defaultExcluded)).toBe(true);
    expect(rows[1]!.amountCents).toBe(0);
  });
  it.each<Record<string, string>>([
    { effective_date: "2026-02-30" },
    { net_cash_amount: "1.001" },
    { currency: "JPY" },
    { account_type: "TFSA" },
    { activity_type: "Trade" },
    { net_cash_amount: "NaN" },
  ])("rejects unsupported or malformed rows %j", async (overrides) => {
    await expect(
      parseWealthsimpleCsv(csvStatement(csvRow(overrides)))
    ).rejects.toThrow();
  });
  it("rejects multiple accounts and malformed quoting", async () => {
    await expect(
      parseWealthsimpleCsv(
        csvStatement(csvRow(), csvRow({ account_id: "other" }))
      )
    ).rejects.toThrow("one Wealthsimple account");
    await expect(
      parseWealthsimpleCsv(csvStatement() + '\n"unclosed')
    ).rejects.toThrow();
    await expect(
      parseWealthsimpleCsv("date,amount\n2026-09-20,10")
    ).rejects.toThrow("original column headers");
  });
});
