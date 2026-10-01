import { CURRENCY_CODES, type CurrencyCode } from "@amigo/db";

export const MAX_OFX_BYTES = 2 * 1024 * 1024;

export interface OfxRow {
  date: string;
  type: "income" | "expense";
  amountCents: number;
  description: string;
  externalId: string;
  currency: CurrencyCode;
  category: string;
  defaultExcluded?: boolean;
}

function field(source: string, name: string, required = true): string {
  const matches = [...source.matchAll(new RegExp(`<${name}>([^<]*)`, "gi"))];
  if (matches.length > 1 || (required && !matches[0]?.[1]?.trim())) {
    throw new Error(`Missing or repeated OFX field: ${name}.`);
  }
  return (matches[0]?.[1] ?? "").trim();
}

function decodeText(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (entity, code: string) => {
      const named: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
      };
      if (!code.startsWith("#")) return named[code.toLowerCase()] ?? entity;
      const n =
        code[1]?.toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : Number(code.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n)
        : entity;
    }
  );
}

/** A deliberately bounded statement importer: no XML entities or investment transactions. */
export async function parseOfx(
  source: string,
  sourceBank?: string
): Promise<{ rows: OfxRow[]; creditCard: boolean }> {
  if (new TextEncoder().encode(source).length > MAX_OFX_BYTES)
    throw new Error("OFX files must be under 2 MB.");
  if (
    !/<OFX>/i.test(source) ||
    !/<\/OFX>\s*$/i.test(source) ||
    /<!DOCTYPE|<!ENTITY/i.test(source)
  ) {
    throw new Error("Invalid or incomplete OFX file.");
  }
  const statements = [
    ...source.matchAll(/<(STMTRS|CCSTMTRS)>([\s\S]*?)<\/\1>/gi),
  ];
  if (statements.length !== 1 || /<INVSTMTRS>/i.test(source))
    throw new Error(
      "Choose an OFX file containing one bank or credit-card account."
    );
  for (const status of source.matchAll(/<STATUS>([\s\S]*?)<\/STATUS>/gi)) {
    if (field(status[1]!, "CODE") !== "0")
      throw new Error("The OFX file contains a bank error.");
  }
  const statement = statements[0]![2]!;
  const creditCard = statements[0]![1]!.toUpperCase() === "CCSTMTRS";
  const currency = field(statement, "CURDEF");
  if (!(CURRENCY_CODES as readonly string[]).includes(currency))
    throw new Error("Unsupported OFX currency.");
  // Read identity from the statement's own account; STMTTRN may carry BANKACCTTO/CCACCTTO.
  const accountFrom = [
    ...statement.matchAll(/<(BANKACCTFROM|CCACCTFROM)>([\s\S]*?)<\/\1>/gi),
  ];
  if (accountFrom.length !== 1)
    throw new Error(
      "Choose an OFX file containing one bank or credit-card account."
    );
  const accountInfo = accountFrom[0]![2]!;
  const account = field(accountInfo, "ACCTID");
  const bank =
    field(accountInfo, "BANKID", false) ||
    field(source, "FID", false) ||
    field(source, "ORG", false) ||
    (sourceBank ? `selected:${sourceBank}` : "");
  if (!bank)
    throw new Error(
      "Select the source bank: this file has no bank identifier."
    );
  const accountType = creditCard ? "creditcard" : field(accountInfo, "ACCTTYPE", false);
  const blocks = [...statement.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)];
  if (
    !blocks.length ||
    blocks.length > 2000 ||
    blocks.length !== (source.match(/<STMTTRN>/gi) ?? []).length
  ) {
    throw new Error("The OFX file must contain 1–2,000 complete transactions.");
  }
  const rows = await Promise.all(
    blocks.map(async ([, block]) => {
      const row = block!;
      if (
        /<CORRECTFITID>|<CORRECTACTION>|<CURRENCY>|<ORIGCURRENCY>/i.test(row)
      ) {
        throw new Error(
          "OFX corrections or transaction-level currencies are not supported yet."
        );
      }
      const rawDate = field(row, "DTPOSTED");
      if (!/^\d{8}(?:\d{6}(?:\.\d+)?(?:\[[^\]]+\])?)?$/.test(rawDate))
        throw new Error("Invalid OFX posting date.");
      const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      const parsedDate = new Date(`${date}T00:00:00Z`);
      if (
        !Number.isFinite(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== date
      )
        throw new Error("Invalid OFX posting date.");
      const rawAmount = field(row, "TRNAMT");
      if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(rawAmount))
        throw new Error(
          "Invalid OFX amount: expected at most two decimal places."
        );
      const [whole, fraction = ""] = rawAmount.replace(/^[+-]/, "").split(".");
      const amountCents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
      if (!Number.isSafeInteger(amountCents) || amountCents === 0)
        throw new Error(
          "OFX amounts must be nonzero and within the supported range."
        );
      const fitid = field(row, "FITID");
      // Hash the bank's account identity so raw account numbers are never stored in externalId.
      // Do not include the selected Amigo account: changing selection must not bypass deduplication.
      const identity = JSON.stringify([
        bank,
        accountType,
        account,
        fitid,
      ]);
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(identity)
      );
      const externalId = `ofx:${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")}`;
      const description = [field(row, "NAME", false), field(row, "MEMO", false)]
        .filter(Boolean)
        .map(decodeText)
        .join(" — ");
      if (description.length > 500)
        throw new Error("An OFX description exceeds 500 characters.");
      return {
        date,
        type: rawAmount.startsWith("-")
          ? ("expense" as const)
          : ("income" as const),
        amountCents,
        description,
        externalId,
        currency: currency as CurrencyCode,
        category: "Uncategorized",
      };
    })
  );
  const seen = new Map<string, OfxRow>();
  for (const row of rows) {
    const prior = seen.get(row.externalId);
    if (prior && JSON.stringify(prior) !== JSON.stringify(row))
      throw new Error("Conflicting transactions share an OFX transaction ID.");
    seen.set(row.externalId, row);
  }
  return { rows, creditCard };
}
