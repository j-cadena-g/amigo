import { describe, expect, it } from "vitest";
import { messagesFor } from "./index";

/**
 * Spanish strings that are rightly the same as English: loanwords, brand-like
 * words, and symbols. Anything else identical is probably untranslated copy.
 */
const SAME_IN_SPANISH = new Set([
  "No",
  "Personal",
  "Snacks",
  "General",
  "Color",
  "Streaming",
  "magenta",
  "Español",
  "English",
  "p. ej. Visa",
  "e.g. Visa",
  "(opcional)",
  "(optional)",
  "Total",
]);

function strings(value: unknown, path: string, out: Map<string, string>) {
  if (typeof value === "string") {
    out.set(path, value);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => strings(item, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) strings(child, `${path}.${key}`, out);
  }
  return out;
}

describe("interface copy", () => {
  const en = strings(messagesFor("en"), "t", new Map());
  const es = strings(messagesFor("es"), "t", new Map());

  it("has the same keys in both languages", () => {
    expect([...es.keys()].sort()).toEqual([...en.keys()].sort());
  });

  it("translates every Spanish string that should differ from English", () => {
    const untranslated = [...en].filter(
      ([path, text]) => es.get(path) === text && !SAME_IN_SPANISH.has(text)
    );
    expect(untranslated).toEqual([]);
  });

  it("uses singular nouns for a count of one in import summaries", () => {
    const en = messagesFor("en").imports;
    const es = messagesFor("es").imports;
    expect(en.finished(1, 1)).toBe("Imported 1 transaction. Skipped 1 duplicate.");
    expect(en.finished(2, 0)).toBe("Imported 2 transactions. Skipped 0 duplicates.");
    expect(en.previewSummary(1, 1)).toBe("1 selected · 1 duplicate will be skipped.");
    expect(en.previewSummary(2, 2)).toBe("2 selected · 2 duplicates will be skipped.");
    expect(en.corrected(1)).toContain("1 transaction.");
    expect(en.corrected(2)).toContain("2 transactions.");
    expect(es.finished(1, 1)).toBe("Se importó 1 movimiento. Se omitió 1 duplicado.");
    expect(es.finished(2, 3)).toBe("Se importaron 2 movimientos. Se omitieron 3 duplicados.");
    expect(es.previewSummary(1, 1)).toBe("1 seleccionado · Se omitirá 1 duplicado.");
    expect(es.previewSummary(2, 2)).toBe("2 seleccionados · Se omitirán 2 duplicados.");
    expect(es.corrected(1)).toContain("1 movimiento sin");
    expect(es.corrected(2)).toContain("2 movimientos sin");
  });

  it("never leaves a string empty", () => {
    const empty = [...en, ...es].filter(([, text]) => text.trim() === "");
    expect(empty).toEqual([]);
  });
});
