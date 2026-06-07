#!/usr/bin/env node
/** Verifies the 1Password .dev.vars mount without printing secret values. */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const devVarsPath = path.join(rootDir, ".dev.vars");
const examplePath = path.join(rootDir, ".dev.vars.example");

const keyPattern = /^\s*#?\s*([A-Z0-9_]+)=/;

function expectedKeys(source) {
  const keys = [];
  const seen = new Set();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(keyPattern);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    keys.push(match[1]);
  }
  return keys;
}

function parseDevVars(content) {
  const parsed = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

if (!existsSync(devVarsPath)) {
  console.error("FAIL: .dev.vars does not exist");
  process.exit(1);
}

const st = statSync(devVarsPath);
const isFifo = (st.mode & 0o170000) === 0o10000;
console.log(`OK: .dev.vars exists (${isFifo ? "FIFO" : "regular file"})`);

const manifest = readFileSync(examplePath, "utf8");
const required = expectedKeys(manifest);
const parsed = parseDevVars(readFileSync(devVarsPath, "utf8"));

const present = [];
const missing = [];

for (const key of required) {
  if (parsed[key]?.trim()) {
    present.push(key);
  } else {
    missing.push(key);
  }
}

console.log(`OK: ${present.length}/${required.length} manifest keys have values`);
if (present.length > 0) {
  console.log(`present: ${present.join(", ")}`);
}

if (missing.length > 0) {
  console.error(`FAIL: missing or empty: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("PASS: amigo (dev) mount is readable and complete");
