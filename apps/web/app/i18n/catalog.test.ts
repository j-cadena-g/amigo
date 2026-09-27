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

  it("never leaves a string empty", () => {
    const empty = [...en, ...es].filter(([, text]) => text.trim() === "");
    expect(empty).toEqual([]);
  });
});
