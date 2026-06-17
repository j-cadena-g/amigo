#!/usr/bin/env node
/**
 * Starts Vite + Cloudflare local dev under op run. Expects secrets in
 * process.env (injected by op run). CLOUDFLARE_INCLUDE_PROCESS_ENV lets the
 * Cloudflare Vite plugin read declared secrets from the process environment
 * instead of a .dev.vars file.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseManifestKeys } from "./lib/parse-manifest-keys.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const examplePath = path.join(rootDir, ".dev.vars.example");

function assertRequiredKeys() {
  const manifest = readFileSync(examplePath, "utf8");
  const required = parseManifestKeys(manifest);
  const missing = required.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    console.error(
      `error: missing local secrets: ${missing.join(", ")}. Set OP_ENVIRONMENT_ID (and OP_SERVICE_ACCOUNT_TOKEN on cloud agents) and run via bun run dev (op run).`,
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
  env: {
    ...process.env,
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
