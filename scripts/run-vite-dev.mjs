#!/usr/bin/env node
/**
 * Starts Vite + Cloudflare local dev under op run. Expects secrets in
 * process.env (injected by op run). run-vite-with-dev-vars.sh writes a
 * temporary `.dev.vars` for the Cloudflare Vite plugin and removes it on exit.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

function assertRequiredKeys() {
  const manifest = readFileSync(examplePath, "utf8");
  const required = expectedKeys(manifest);
  const missing = required.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    console.error(
      `error: missing local secrets: ${missing.join(", ")}. Set OP_ENVIRONMENT_ID in .op/refs.env and run via bun run dev (op run).`,
    );
    process.exit(1);
  }
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("usage: run-vite-dev.mjs <command> [args...]");
  process.exit(1);
}

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
