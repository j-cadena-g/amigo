import type { UiLanguage } from "@amigo/db";
import { BANK_CHARGE_LABELS } from "./server-messages";

export type BankDescriptionLanguage = UiLanguage;

/** Tokens and phrases banks print in all caps that should stay as written. */
const AS_WRITTEN = ["Amazon.ca", "Amazon.com", "Apple.com", "X", "TikTok", "407 ETR"];

const INTEREST =
  /^(PURCHASE INTEREST|INSTALLMENT INTEREST|CASH ADVANCE INTEREST)\b/i;
const CARD_FEE =
  /^(ANNUAL FEE|OVERLIMIT FEE|OVER LIMIT FEE|LATE PAYMENT FEE|LATE FEE|CASH ADVANCE FEE|FOREIGN TRANSACTION FEE|RETURNED PAYMENT FEE|NSF FEE)\b/i;
/** A refunded or reversed charge is a credit, so it keeps its own words. */
const CHARGE_REVERSAL = /\b(REFUND|REFUNDED|REVERSAL|REVERSED|REBATE|ADJUSTMENT|ADJ)\b/i;
/** Money sent between people. The text often holds a person's name, not a merchant. */
const PERSON_TO_PERSON =
  /\b(e[- ]?transfers?|e[- ]?(tfr|trf)|emt|email money (transfer|trf)|interac|send money|money request|request money|transfer (from|to)|zelle|venmo|cash ?app|transferencias?|nequi|daviplata|bre-?b)\b/i;
const NAME_MEMO = " — ";

/**
 * Turn a bank's raw transaction text into a short display name.
 * `merchantKey` is the uppercase core before title case and charge renaming.
 * `charge` is true when the interest or card-fee rule produced the name.
 */
export function cleanBankDescription(
  raw: string,
  language: BankDescriptionLanguage
): { name: string; merchantKey: string; charge: boolean } {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  // Split the bank's NAME — MEMO join on the first em dash.
  const trimmed = raw.trim();
  const separator = trimmed.indexOf(NAME_MEMO);
  const memo = separator === -1 ? "" : trimmed.slice(separator + NAME_MEMO.length);
  // Fixed-width card city/region, or a padded region code.
  let text = stripCardLocation(separator === -1 ? trimmed : trimmed.slice(0, separator));
  // Drop a memo that repeats the name, or that is only a place or a number.
  text = applyMemo(text, memo);
  // Store numbers, phones, masks, reference codes, and the 407-ETR- toll label.
  text = stripNoise(text).replace(/407[-\s]*ETR-?/gi, "407 ETR");
  text = stripProcessors(text);
  // Collapse a repeated domain. Leave a repeated word (`BURGER BURGER`) alone.
  text = collapseDomainRepeats(text);
  const core = text.replace(/\s+/g, " ").trim();

  if (!core) {
    return { name: collapsed, merchantKey: collapsed.toUpperCase(), charge: false };
  }

  const reversed = CHARGE_REVERSAL.test(core);
  const interest = reversed ? null : INTEREST.exec(core);
  if (interest) {
    return {
      name: BANK_CHARGE_LABELS[language].interestCharge,
      merchantKey: interest[1]!.toUpperCase(),
      charge: true,
    };
  }
  const fee = reversed ? null : CARD_FEE.exec(core);
  if (fee) {
    return {
      name: BANK_CHARGE_LABELS[language].cardFee,
      merchantKey: fee[1]!.toUpperCase(),
      charge: true,
    };
  }

  const merchantKey = core.toUpperCase();
  const name = /[A-Z]/.test(core) && !/[a-z]/.test(core) ? titleCase(core) : core;
  return { name, merchantKey, charge: false };
}

/** Fixed-width card line, otherwise a padded trailing region code. */
function stripCardLocation(left: string): string {
  if (
    left.length === 39 &&
    left[22] === " " &&
    left[36] === " " &&
    /^[A-Z]{2}$/.test(left.slice(37))
  ) {
    return left.slice(0, 22).trim();
  }
  return left.replace(/\s{2,}[A-Z]{2}$/, "").trim();
}

function applyMemo(left: string, memo: string): string {
  const trimmedMemo = memo.trim();
  const name = left.trim();
  if (!trimmedMemo) return name;
  const region = trimmedMemo.match(/^(.*\S)\s+([A-Z]{2,3})$/);
  const memoCore = region?.[1] ?? trimmedMemo;
  const stripped =
    stripTail(name, trimmedMemo) ??
    (memoCore === trimmedMemo ? null : stripTail(name, memoCore));
  if (stripped) return stripped;
  if (isDisposableMemo(trimmedMemo)) return name;
  return `${name} — ${trimmedMemo}`;
}

/** True when `suffix` repeats the end of `name` and is not the whole name. */
function stripTail(name: string, suffix: string): string | null {
  if (!suffix || suffix.length >= name.length) return null;
  const start = name.length - suffix.length;
  if (name.slice(start).toLowerCase() !== suffix.toLowerCase()) return null;
  if (/[A-Za-z0-9]/.test(name[start - 1]!)) return null;
  const next = name.slice(0, start).trim();
  return next || null;
}

function isDisposableMemo(memo: string): boolean {
  if (/^[A-Z]{2,3}$/.test(memo)) return true;
  const body = memo.replace(/\s+[A-Z]{2,3}$/, "").trim();
  if (!body) return true;
  const cleaned = stripNoise(body).trim();
  if (!cleaned || /^[A-Z]{2,3}$/.test(cleaned)) return true;
  return cleaned.split(/\s+/).every((token) => !/[A-Za-z]/.test(token));
}

function stripNoise(value: string): string {
  const withoutMarks = value
    .replace(/#\s*\d+/g, " ")
    .replace(/\*{2,}\d+/g, " ")
    .replace(/-[A-Za-z]\d{6,}/g, " ")
    .replace(/\*([A-Za-z0-9]{8,})/g, (match, code: string) =>
      /\d/.test(code) ? "" : match
    );
  const tokens = withoutMarks.split(/\s+/).flatMap((token) => {
    if (!token || isPhoneOrDigitRun(token)) return [];
    const withoutRuns = token.replace(/\d{6,}/g, "");
    return withoutRuns ? [withoutRuns] : [];
  });
  const trailing = tokens[tokens.length - 1];
  if (
    tokens.length >= 2 &&
    trailing &&
    /^\d{3,5}$/.test(trailing) &&
    tokens.slice(0, -1).some((token) => /[A-Za-z]/.test(token))
  ) {
    tokens.pop();
  }
  return tokens.join(" ");
}

function isPhoneOrDigitRun(token: string): boolean {
  const digits = token.replace(/\D/g, "");
  return digits.length >= 6 && /^[+\d().-]+$/.test(token);
}

function stripProcessors(value: string): string {
  return value
    .replace(/^PAYPAL\s+\*\s*/i, "")
    .replace(/^SQ\s+\*\s*/i, "")
    .replace(/^GOOGLE\s*\*\s*/i, "GOOGLE ")
    .replace(/\*/g, " ");
}

function collapseDomainRepeats(value: string): string {
  const tokens = value.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const token of tokens) {
    const previous = out[out.length - 1];
    if (previous && isDomainRepeat(previous, token)) {
      out[out.length - 1] = plainDomainToken(previous, token);
      continue;
    }
    out.push(token);
  }
  return out.join(" ");
}

function isDomainRepeat(left: string, right: string): boolean {
  if (left.toUpperCase() === right.toUpperCase()) return left.includes(".");
  return domainPlain(left, right) !== null;
}

/** The undotted word when one token is that word plus a domain suffix. */
function plainDomainToken(left: string, right: string): string {
  return domainPlain(left, right) ?? left;
}

function domainPlain(left: string, right: string): string | null {
  for (const [plain, dotted] of [
    [left, right],
    [right, left],
  ] as const) {
    if (plain.includes(".") || !dotted.includes(".")) continue;
    if (!dotted.toUpperCase().startsWith(`${plain.toUpperCase()}.`)) continue;
    const suffix = dotted.slice(plain.length + 1);
    if (/^[A-Za-z]{1,24}(?:\.[A-Za-z]{1,24})*$/.test(suffix)) return plain;
  }
  return null;
}

function titleCase(value: string): string {
  const words = value.split(" ");
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const next = words[i + 1];
    if (word.toUpperCase() === "407" && next?.toUpperCase() === "ETR") {
      out.push("407 ETR");
      i++;
      continue;
    }
    out.push(styleToken(word));
  }
  return out.join(" ");
}

function styleToken(token: string): string {
  const kept = AS_WRITTEN.find((entry) => entry.toLowerCase() === token.toLowerCase());
  if (kept) return kept;
  if (isConsonantAcronym(token)) return token;
  if (token.includes(".")) {
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  }
  const punctuated = token.match(/^([^A-Za-z]+)([A-Za-z].*)$/);
  if (punctuated) return punctuated[1]! + styleToken(punctuated[2]!);
  return token
    .split("-")
    .map((part) => stylePart(part))
    .join("-");
}

/** `RCSS` and `CR` stay uppercase; `Y` counts as a vowel. */
function isConsonantAcronym(token: string): boolean {
  return /^[A-Z]{2,4}$/.test(token) && !/[AEIOUY]/.test(token);
}

function stylePart(part: string): string {
  if (!part) return part;
  if (isConsonantAcronym(part)) return part;
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

/** True for person-to-person transfers, which should never be sent to an AI model. */
export function isPersonToPerson(raw: string): boolean {
  return PERSON_TO_PERSON.test(raw);
}
