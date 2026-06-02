#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const templatePath = path.join(rootDir, "wrangler.jsonc");
const outputPath = path.join(rootDir, ".wrangler.deploy.jsonc");

const requiredValues = {
  CLOUDFLARE_ACCOUNT_ID: {
    pattern: /^[a-f0-9]{32}$/i,
    description: "32-character Cloudflare account id",
  },
  CLOUDFLARE_D1_DATABASE_ID: {
    pattern: /^[a-f0-9]{32}$/i,
    description: "32-character D1 database id",
  },
  CLOUDFLARE_KV_NAMESPACE_ID: {
    pattern: /^[a-f0-9]{32}$/i,
    description: "32-character KV namespace id",
  },
  CLOUDFLARE_CUSTOM_DOMAIN: {
    pattern: /^[^/\s]+(?:\/\*)?$/i,
    description: "custom domain or route pattern without protocol",
  },
  CLERK_PUBLISHABLE_KEY: {
    pattern: /^pk_(test|live)_[A-Za-z0-9+/=]+\$$/,
    description: "Clerk publishable key (pk_test_/pk_live_ + base64 payload + $)",
  },
};

const replacements = [
  {
    label: "account_id",
    pattern: /("account_id"\s*:\s*")([^"]*)(")/,
    envName: "CLOUDFLARE_ACCOUNT_ID",
  },
  {
    label: "database_id",
    pattern: /("database_id"\s*:\s*")([^"]*)(")/,
    envName: "CLOUDFLARE_D1_DATABASE_ID",
  },
  {
    label: "kv namespace id",
    pattern:
      /("kv_namespaces"\s*:\s*\[\s*\{[\s\S]*?"id"\s*:\s*")([^"]*)(")/,
    envName: "CLOUDFLARE_KV_NAMESPACE_ID",
  },
  {
    label: "route pattern",
    pattern: /("pattern"\s*:\s*")([^"]*)(")/,
    envName: "CLOUDFLARE_CUSTOM_DOMAIN",
  },
  {
    label: "APP_ENV",
    pattern: /("APP_ENV"\s*:\s*")([^"]*)(")/,
    envName: "APP_ENV",
  },
  {
    label: "CLERK_PUBLISHABLE_KEY",
    pattern: /("CLERK_PUBLISHABLE_KEY"\s*:\s*")([^"]*)(")/,
    envName: "CLERK_PUBLISHABLE_KEY",
  },
];

function getRequiredValue(name) {
  const value = globalThis.process.env[name]?.trim();
  const rule = requiredValues[name];

  if (!value) {
    throw new Error(`Missing ${name} (${rule.description}).`);
  }

  if (!rule.pattern.test(value)) {
    throw new Error(`Invalid ${name}; expected ${rule.description}.`);
  }

  return value;
}

function replaceConfigValue(source, { label, pattern }, value) {
  let replaced = false;

  const nextSource = source.replace(pattern, (_match, prefix, _current, suffix) => {
    replaced = true;
    return `${prefix}${value}${suffix}`;
  });

  if (!replaced) {
    throw new Error(`Could not find ${label} in ${path.basename(templatePath)}.`);
  }

  return nextSource;
}

async function main() {
  const template = await readFile(templatePath, "utf8");
  const deployValues = {
    CLOUDFLARE_ACCOUNT_ID: getRequiredValue("CLOUDFLARE_ACCOUNT_ID"),
    CLOUDFLARE_D1_DATABASE_ID: getRequiredValue("CLOUDFLARE_D1_DATABASE_ID"),
    CLOUDFLARE_KV_NAMESPACE_ID: getRequiredValue("CLOUDFLARE_KV_NAMESPACE_ID"),
    CLOUDFLARE_CUSTOM_DOMAIN: getRequiredValue("CLOUDFLARE_CUSTOM_DOMAIN"),
    CLERK_PUBLISHABLE_KEY: getRequiredValue("CLERK_PUBLISHABLE_KEY"),
    APP_ENV: globalThis.process.env.APP_ENV?.trim() || "production",
  };

  let rendered = template;
  for (const replacement of replacements) {
    rendered = replaceConfigValue(
      rendered,
      replacement,
      deployValues[replacement.envName]
    );
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered);

  globalThis.console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
}

await main();
