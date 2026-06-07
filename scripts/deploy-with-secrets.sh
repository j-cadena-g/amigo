#!/usr/bin/env bash
# Renders deploy config and a temporary secrets file from process.env (op run),
# then runs remote migrations and wrangler deploy. Never commits secret files.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_FILE="$(mktemp "${TMPDIR:-/tmp}/amigo-wrangler-secrets.XXXXXX.json")"
DEPLOY_CONFIG="${ROOT_DIR}/.wrangler.deploy.jsonc"

cleanup() {
  rm -f "${SECRETS_FILE}"
}

trap cleanup EXIT

cd "${ROOT_DIR}"

bun run wrangler:deploy-config
node scripts/render-wrangler-secrets.mjs "${SECRETS_FILE}"

wrangler d1 migrations apply amigo-db --remote --config "${DEPLOY_CONFIG}"
wrangler deploy --config "${DEPLOY_CONFIG}" --secrets-file "${SECRETS_FILE}"
