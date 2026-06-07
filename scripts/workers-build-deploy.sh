#!/usr/bin/env bash
# Entry point for Cloudflare Workers Builds (Git-connected deploys).
#
# Configure the build in the Cloudflare dashboard to run this script after
# `bun install` and `bun run build`. Store only these bootstrap secrets in
# Workers Builds (not the full app secret set):
#
#   OP_SERVICE_ACCOUNT_TOKEN  — read-only service account for op run
#   OP_ENVIRONMENT_ID         — target 1Password Environment UUID
#
# The Environment must define every key in .deploy.env.example and
# .wrangler.secrets.example (names only; see README). Deploy uploads secrets
# from 1Password via wrangler deploy --secrets-file — do not use wrangler secret put.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${OP_ENVIRONMENT_ID:-}" ] && [ -f "${ROOT_DIR}/.op/refs.env" ]; then
  # shellcheck disable=SC1091
  set -a
  # refs.env is gitignored; only OP_ENVIRONMENT_ID is expected.
  source "${ROOT_DIR}/.op/refs.env"
  set +a
fi

if [ -z "${OP_ENVIRONMENT_ID:-}" ]; then
  echo "error: set OP_ENVIRONMENT_ID (Workers Builds secret or .op/refs.env) for deploy." >&2
  exit 1
fi

if ! command -v op >/dev/null 2>&1; then
  export OP_BIN_DIR="${ROOT_DIR}/.bin"
  bash "${ROOT_DIR}/scripts/install-op.sh"
  export PATH="${OP_BIN_DIR}:${PATH}"
fi

if ! command -v op >/dev/null 2>&1; then
  echo "error: 1Password CLI (op) is required for Workers Builds deploy." >&2
  exit 1
fi

if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
  echo "error: set OP_SERVICE_ACCOUNT_TOKEN in Workers Builds for non-interactive op run." >&2
  exit 1
fi

cd "${ROOT_DIR}"
exec op run --environment "${OP_ENVIRONMENT_ID}" -- bun run deploy:internal
