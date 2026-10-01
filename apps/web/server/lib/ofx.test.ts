import { describe, expect, it } from "vitest";
import { parseOfx } from "./ofx";

import { statement, transaction } from "../test/ofx-fixture";

describe("OFX statement import", () => {
  it("supports QFX files without bank metadata through an explicit bank selection", async () => {
    const source = statement().replace(/<FI>[\s\S]*?<\/FI>/, "");
    await expect(parseOfx(source)).rejects.toThrow("Select the source bank");
    const scotia = await parseOfx(source, "scotiabank");
    const rbc = await parseOfx(
      source.replace("<CURDEF>CAD", "<CURDEF>USD"),
      "rbc"
    );
    expect(scotia.rows[0]!.externalId).not.toBe(rbc.rows[0]!.externalId);
    expect(rbc.rows[0]!.currency).toBe("USD");
  });
  it("reads SGML, preserves posting day and converts exact cents", async () => {
    const { rows, creditCard } = await parseOfx(statement());
    expect(creditCard).toBe(true);
    expect(rows[0]).toMatchObject({
      date: "2026-09-29",
      amountCents: 1234,
      description: "Café & market",
      currency: "CAD",
      type: "expense",
    });
    expect(rows[0]!.externalId).toMatch(/^ofx:[0-9a-f]{64}$/);
  });
  it("supports closed leaf tags and bank accounts", async () => {
    const source = statement()
      .replaceAll("CCSTMTRS", "STMTRS")
      .replace("<CURDEF>CAD", "<CURDEF>CAD</CURDEF>")
      .replace("<TRNAMT>-12.34", "<TRNAMT>-12.34</TRNAMT>");
    expect((await parseOfx(source)).creditCard).toBe(false);
  });
  it("namespaces transaction IDs by bank and source account", async () => {
    const a = (await parseOfx(statement())).rows[0]!;
    const b = (await parseOfx(statement(transaction(), "other-account")))
      .rows[0]!;
    const c = (await parseOfx(statement().replace("<FID>999", "<FID>888")))
      .rows[0]!;
    expect(a.externalId).not.toBe(b.externalId);
    expect(a.externalId).not.toBe(c.externalId);
    expect((await parseOfx(statement())).rows[0]!.externalId).toBe(
      a.externalId
    );
  });
  it("reads account identity from the statement, not transfer destinations", async () => {
    const transfer = transaction().replace(
      "</STMTTRN>",
      "<BANKACCTTO><BANKID>123<ACCTID>destination<ACCTTYPE>SAVINGS</BANKACCTTO></STMTTRN>"
    );
    const plain = (await parseOfx(statement())).rows[0]!;
    const withTransfer = (await parseOfx(statement(transfer))).rows[0]!;
    expect(withTransfer.externalId).toBe(plain.externalId);
  });
  it("handles credits and single decimal amounts", async () => {
    expect(
      (await parseOfx(statement(transaction("credit", "+0.1")))).rows[0]
    ).toMatchObject({ amountCents: 10, type: "income" });
  });
  it.each(["0", "-1.234", "1,50", "1e3", "9007199254740992", "NaN"])(
    "rejects unsafe amount %s",
    async (amount) => {
      await expect(
        parseOfx(statement(transaction("x", amount)))
      ).rejects.toThrow();
    }
  );
  it.each(["20260230000000", "20261301000000", "garbage"])(
    "rejects date %s",
    async (date) => {
      await expect(
        parseOfx(statement(transaction("x", "-1.00", date)))
      ).rejects.toThrow();
    }
  );
  it("rejects missing IDs, truncated files, bank errors and corrections", async () => {
    for (const source of [
      statement().replace("<FITID>synthetic-1", ""),
      statement().replace("</STMTTRN>", ""),
      statement().replace("</OFX>", ""),
      statement().replace("<CODE>0", "<CODE>2000"),
      statement().replace("<NAME>", "<CORRECTFITID>old<NAME>"),
    ]) {
      await expect(parseOfx(source)).rejects.toThrow();
    }
  });
  it("rejects conflicting repeated IDs", async () => {
    await expect(
      parseOfx(statement(transaction() + transaction("synthetic-1", "-9.00")))
    ).rejects.toThrow("Conflicting");
  });
  it("rejects entities, unsupported currency, and multiple statements", async () => {
    for (const source of [
      "<!DOCTYPE OFX>" + statement(),
      statement().replace("<CURDEF>CAD", "<CURDEF>JPY"),
      statement().replace("</OFX>", "<CCSTMTRS></CCSTMTRS></OFX>"),
    ])
      await expect(parseOfx(source)).rejects.toThrow();
  });
});
