#!/usr/bin/env bash

# Generates a temporary .dev.vars file from process.env (injected by op run)
# using .dev.vars.example as the key manifest. The Cloudflare vite plugin reads
# .dev.vars via getPlatformProxy(), so we write directly to the project root.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE_FILE="${ROOT_DIR}/.dev.vars.example"
DEV_VARS_FILE="${ROOT_DIR}/.dev.vars"

if [ ! -f "${EXAMPLE_FILE}" ]; then
  echo "error: .dev.vars.example not found in project root" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 1
fi

cleanup() {
  rm -f "${DEV_VARS_FILE}"
}

trap cleanup EXIT

node - "${EXAMPLE_FILE}" "${DEV_VARS_FILE}" <<'EOF'
const fs = require("fs");

const exampleFile = process.argv[2];
const envFile = process.argv[3];
const lines = fs.readFileSync(exampleFile, "utf8").split(/\r?\n/);
const seen = new Set();
const keys = [];

for (const line of lines) {
  const match = line.match(/^\s*#?\s*([A-Z0-9_]+)=/);
  if (!match) continue;
  const key = match[1];
  if (seen.has(key)) continue;
  seen.add(key);
  if (Object.prototype.hasOwnProperty.call(process.env, key)) {
    keys.push(`${key}=${JSON.stringify(process.env[key])}`);
  }
}

fs.writeFileSync(envFile, keys.length > 0 ? `${keys.join("\n")}\n` : "");
EOF

exec "$@"
