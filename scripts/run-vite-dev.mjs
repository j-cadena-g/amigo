#!/usr/bin/env node
/**
 * Starts Vite + Cloudflare local dev. Reads the 1Password-mounted `.dev.vars`
 * FIFO once into process.env (existing env wins) so Wrangler/Vite do not need
 * a generated plaintext file. Do not delete or overwrite `.dev.vars`.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

function loadMountedDevVars() {
  if (!existsSync(devVarsPath)) {
    console.warn(
      `warning: ${path.basename(devVarsPath)} not found. Mount amigo (dev) from 1Password or export vars from .dev.vars.example.`,
    );
    return;
  }

  const content = readFileSync(devVarsPath, "utf8");
  const parsed = parseDevVars(content);
  let loaded = 0;

  for (const [key, value] of Object.entries(parsed)) {
    if (value === "" || process.env[key] !== undefined) continue;
    process.env[key] = value;
    loaded += 1;
  }

  if (loaded > 0) {
    console.log(
      `Loaded ${loaded} local secret(s) from ${path.basename(devVarsPath)} into process.env.`,
    );
  }
}

function assertRequiredKeys() {
  const manifest = readFileSync(examplePath, "utf8");
  const required = expectedKeys(manifest);
  const missing = required.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    console.error(
      `error: missing local secrets: ${missing.join(", ")}. Check the amigo (dev) 1Password mount at .dev.vars.`,
    );
    process.exit(1);
  }
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("usage: run-vite-dev.mjs <command> [args...]");
  process.exit(1);
}

loadMountedDevVars();
assertRequiredKeys();

const devWranglerConfig = path.join(rootDir, ".wrangler.dev.jsonc");
process.env.WRANGLER_RENDER_OUTPUT = devWranglerConfig;
await import("./render-wrangler-deploy-config.mjs");
process.env.AMIGO_WRANGLER_CONFIG = devWranglerConfig;

const viteBin = path.join(rootDir, "node_modules/vite/bin/vite.js");
const useVite =
  command === "vite" && existsSync(viteBin)
    ? [viteBin, ...args]
    : [command, ...args];
const executable = useVite[0] === viteBin ? process.execPath : command;
const spawnArgs = useVite[0] === viteBin ? useVite : args;

const child = spawn(executable, spawnArgs, {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
