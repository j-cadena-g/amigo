import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = import.meta.dirname;
const THIS_FILE = path.basename(import.meta.filename);

interface BannedPattern {
  reason: string;
  test: (line: string) => boolean;
}

const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";

const matches = (pattern: RegExp) => (line: string) => pattern.test(line);

const BANNED: BannedPattern[] = [
  {
    reason: "gradient backgrounds",
    test: matches(/\bbg-(?:gradient|linear|radial|conic)-/),
  },
  {
    reason: "blur and frosted glass",
    test: matches(/\bbackdrop-blur\b|\bblur-(?:xs|sm|md|lg|xl|[234]xl)\b/),
  },
  {
    reason: "colored shadows",
    test: matches(
      /\bshadow-(?:primary|secondary|accent|destructive|success|warning|info|tag|foreground|black|white|[a-z]+-\d{2,3})(?:\/|\b)/
    ),
  },
  {
    reason: "uppercase letter-spaced labels",
    test: (line) =>
      /\buppercase\b/.test(line) && /\btracking-wide(?:r|st)?\b/.test(line),
  },
  {
    reason: "radii above rounded-xl",
    test: matches(/\brounded-(?:[trblse]{1,2}-)?[234]xl\b/),
  },
  {
    reason: "load, hover-lift, and pulse animations",
    test: matches(
      /\banimate-(?:fade-in|fade-in-scale|stagger-in|slide-in|pulse-soft|pulse|bounce|ping)\b|\bcard-interactive\b|\bpage-enter\b|\b(?:active|hover|group-hover):scale-/
    ),
  },
  {
    reason: "Tailwind palette colors instead of theme tokens",
    test: matches(
      new RegExp(
        `\\b(?:text|bg|border|ring|fill|stroke|from|via|to|outline|decoration|divide|placeholder|accent|caret|shadow)-(?:${PALETTE})-\\d{2,3}\\b`
      )
    ),
  },
  {
    reason: "hex colors instead of theme tokens",
    test: matches(/\b[a-z-]+-\[#[0-9a-fA-F]{3,8}\]/),
  },
  {
    reason: "text smaller than 12px",
    test: matches(/\btext-\[(?:[0-9]|1[01])px\]/),
  },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.(?:test|spec)\.tsx?$/.test(entry.name) || entry.name === THIS_FILE) {
      return [];
    }
    return [fullPath];
  });
}

const isBanned = (line: string) => BANNED.some((banned) => banned.test(line));

describe("design guard", () => {
  it.each([
    "bg-gradient-to-br from-primary/5",
    "bg-linear-to-r",
    "backdrop-blur-sm",
    "rounded-full bg-primary/5 blur-3xl",
    "shadow-sm shadow-primary/20",
    "shadow-black/[0.03]",
    "text-xs uppercase tracking-wider",
    "rounded-2xl border",
    "animate-fade-in",
    "animate-stagger-in",
    "card-interactive",
    "active:scale-[0.97]",
    "bg-blue-100 text-blue-700",
    "bg-[#ffd400] text-[#151515]",
    "border-[#E2E2DD]",
    "text-[10px]",
  ])("flags %s", (line) => {
    expect(isBanned(line)).toBe(true);
  });

  it.each([
    "shadow-lg",
    "font-mono uppercase",
    "rounded-xl border",
    "animate-appear",
    "animate-spin",
    "bg-(--tag-blue)",
    "bg-tag text-tag-foreground",
    'content="#ffffff"',
    "text-xs",
  ])("allows %s", (line) => {
    expect(isBanned(line)).toBe(false);
  });

  it("keeps banned UI patterns out of apps/web/app", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(APP_DIR)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const banned of BANNED) {
          if (banned.test(line)) {
            violations.push(
              `${path.relative(APP_DIR, file)}:${index + 1} ${banned.reason}: ${line.trim()}`
            );
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
