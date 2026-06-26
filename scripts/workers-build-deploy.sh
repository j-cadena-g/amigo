#!/usr/bin/env bash
# Alias for Workers Builds configs that still reference this script.
# Prefer `pnpm run deploy` — both use run-with-1password-environment.sh.

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "${ROOT_DIR}/scripts/run-with-1password-environment.sh" -- pnpm run deploy:internal
