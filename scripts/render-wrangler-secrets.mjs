#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const manifestPath = path.join(rootDir, ".wrangler.secrets.example");

const keyPattern = /^\s*#?\s*([A-Z0-9_]+)=/;

function parseManifestKeys(source) {
  const keys = [];
  const seen = new Set();

  for (const line of source.split(/\r?\n/)) {
    const match = line.match(keyPattern);
    if (!match) continue;
    const key = match[1];
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }

  return keys;
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error("usage: render-wrangler-secrets.mjs <output.json>");
    process.exit(1);
  }

  const manifest = await readFile(manifestPath, "utf8");
  const keys = parseManifestKeys(manifest);
  if (keys.length === 0) {
    throw new Error(`No secret keys found in ${path.basename(manifestPath)}.`);
  }

  const secrets = {};
  const missing = [];

  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (!value) {
      missing.push(key);
      continue;
    }
    secrets[key] = value;
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing Worker secrets (set in 1Password Environment): ${missing.join(", ")}.`
    );
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(secrets, null, 2)}\n`, {
    mode: 0o600,
  });
}

await main();
