#!/usr/bin/env node
/** Verifies amigo (dev) Environment secrets injected by op run (names only). */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseManifestKeys } from "./lib/parse-manifest-keys.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const examplePath = path.join(rootDir, ".dev.vars.example");

const manifest = readFileSync(examplePath, "utf8");
const required = parseManifestKeys(manifest);

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
    "hint: local dev — set OP_ENVIRONMENT_ID in .op/refs.env and sign in with op; cloud agents — set OP_SERVICE_ACCOUNT_TOKEN and OP_ENVIRONMENT_ID (amigo dev) in Cursor environment secrets",
  );
  process.exit(1);
}

console.log("PASS: amigo (dev) Environment is complete");
