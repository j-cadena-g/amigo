#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseManifestKeys } from "./lib/parse-manifest-keys.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const templatePath = path.join(rootDir, "wrangler.jsonc");
const secretsExamplePath = path.join(rootDir, ".wrangler.secrets.example");

const outputPath = process.env.WRANGLER_RENDER_OUTPUT
  ? path.resolve(rootDir, process.env.WRANGLER_RENDER_OUTPUT)
  : path.join(rootDir, ".wrangler.deploy.jsonc");

const requiredValues = {
  CLOUDFLARE_ACCOUNT_ID: {
    pattern: /^[a-f0-9]{32}$/i,
    description: "32-character Cloudflare account id",
  },
  CLOUDFLARE_D1_DATABASE_ID: {
    pattern: /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
    description: "D1 database id (32 hex chars or UUID)",
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
    // Clerk's $ delimiter is inside the base64 payload (decodes to …dev$), not a
    // literal trailing character — see clerk.com/docs/guides/how-clerk-works/overview
    pattern: /^pk_(test|live)_[A-Za-z0-9_-]+={0,2}$/,
    description:
      "Clerk publishable key (pk_test_/pk_live_ + URL-safe base64 FAPI URL)",
  },
  APP_ORIGIN: {
    pattern: /^https?:\/\/[^/\s?#]+$/i,
    description: "application origin including protocol, without path",
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
    label: "APP_ORIGIN",
    pattern: /("APP_ORIGIN"\s*:\s*")([^"]*)(")/,
    envName: "APP_ORIGIN",
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
    APP_ORIGIN: getRequiredValue("APP_ORIGIN"),
    APP_ENV:
      globalThis.process.env.APP_ENV?.trim() ||
      (outputPath.endsWith(".wrangler.dev.jsonc") ? "development" : "production"),
  };

  let rendered = template;
  for (const replacement of replacements) {
    rendered = replaceConfigValue(
      rendered,
      replacement,
      deployValues[replacement.envName]
    );
  }

  if (outputPath.endsWith(".wrangler.dev.jsonc")) {
    rendered = rendered.replace(/\n\s*"account_id"\s*:\s*"[^"]*",/, "\n");
    rendered = rendered.replace(/"workers_dev"\s*:\s*false/, '"workers_dev": true');
    rendered = rendered.replace(/"routes"\s*:\s*\[[\s\S]*?\],/, '"routes": [],');
    rendered = rendered.replace(
      /"placement"\s*:\s*\{[\s\S]*?\},/,
      "",
    );

    const secretsExample = await readFile(secretsExamplePath, "utf8");
    const requiredSecrets = parseManifestKeys(secretsExample);
    if (requiredSecrets.length === 0) {
      throw new Error(`No secret keys found in ${path.basename(secretsExamplePath)}.`);
    }

    const secretsBlock = [
      '  "secrets": {',
      '    "required": [',
      ...requiredSecrets.map((key) => `      "${key}",`),
      "    ]",
      "  },",
    ].join("\n");

    const varsBlockStart = /\n(\s*"vars"\s*:\s*\{)/;
    if (!varsBlockStart.test(rendered)) {
      throw new Error(`Could not find vars block in ${path.basename(templatePath)}.`);
    }
    rendered = rendered.replace(varsBlockStart, `\n\n${secretsBlock}\n$1`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered);

  globalThis.console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
}

await main();
