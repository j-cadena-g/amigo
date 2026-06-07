#!/usr/bin/env node
/** Verifies amigo (dev) Environment secrets injected by op run (names only). */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
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

const manifest = readFileSync(examplePath, "utf8");
const required = expectedKeys(manifest);

const present = [];
const missing = [];

for (const key of required) {
  if (process.env[key]?.trim()) {
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
  console.error(
    "hint: set OP_ENVIRONMENT_ID in .op/refs.env, sign in with op, and run via bun run dev:verify",
  );
  process.exit(1);
}

console.log("PASS: amigo (dev) Environment is complete");
