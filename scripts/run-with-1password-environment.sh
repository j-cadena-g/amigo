#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_REFS_FILE="${WEB_REFS_FILE:-${ROOT_DIR}/apps/web/.op/refs.env}"
REF_KEY="OP_ENVIRONMENT_ID"
CURSOR_OP_SERVICE_ACCOUNT_TOKEN_KEY="AMIGO_OP_SERVICE_ACCOUNT_TOKEN"
CURSOR_OP_ENVIRONMENT_ID_KEY="AMIGO_OP_ENVIRONMENT_ID"

trim() {
  local input="$1"
  input="${input#"${input%%[![:space:]]*}"}"
  input="${input%"${input##*[![:space:]]}"}"
  printf '%s' "${input}"
}

strip_wrapping_quotes() {
  local value="$1"
  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "${value}"
}

# Cursor dashboard secrets are shared across repositories, so cloud agents use
# AMIGO_-prefixed names. Map them onto the names 1Password CLI already expects
# when the unprefixed vars are unset (local shells and Workers Builds).
apply_cursor_cloud_aliases() {
  if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
    local cursor_token=""
    cursor_token="$(printenv "${CURSOR_OP_SERVICE_ACCOUNT_TOKEN_KEY}" 2>/dev/null || true)"
    cursor_token="$(trim "${cursor_token}")"
    if [ -n "${cursor_token}" ]; then
      export OP_SERVICE_ACCOUNT_TOKEN="${cursor_token}"
    fi
  fi

  if [ -z "${OP_ENVIRONMENT_ID:-}" ]; then
    local cursor_environment_id=""
    cursor_environment_id="$(printenv "${CURSOR_OP_ENVIRONMENT_ID_KEY}" 2>/dev/null || true)"
    cursor_environment_id="$(trim "${cursor_environment_id}")"
    if [ -n "${cursor_environment_id}" ]; then
      export OP_ENVIRONMENT_ID="${cursor_environment_id}"
    fi
  fi
}

resolve_op_environment_id() {
  local shell_value=""
  shell_value="$(printenv "${REF_KEY}" 2>/dev/null || true)"
  if [ -n "${shell_value}" ]; then
    printf '%s' "${shell_value}"
    return 0
  fi

  if [ ! -f "${WEB_REFS_FILE}" ]; then
    return 0
  fi

  local line
  local key
  local value

  while IFS= read -r line || [ -n "${line}" ]; do
    line="${line%$'\r'}"
    line="$(trim "${line}")"
    if [ -z "${line}" ] || [[ "${line}" == \#* ]] || [[ "${line}" != *=* ]]; then
      continue
    fi

    key="$(trim "${line%%=*}")"
    value="$(trim "${line#*=}")"
    case "${key}" in
      "${REF_KEY}")
        strip_wrapping_quotes "${value}"
        return 0
        ;;
    esac
  done < "${WEB_REFS_FILE}"
}

while [ "$#" -gt 0 ]; do
  case "${1}" in
    --ref-key)
      if [ "$#" -lt 2 ]; then
        echo "error: --ref-key requires a value." >&2
        exit 1
      fi
      REF_KEY="$2"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if [ "$#" -eq 0 ]; then
  echo "usage: $0 [--ref-key KEY] -- <command> [args...]" >&2
  exit 1
fi

ensure_op_cli() {
  export OP_BIN_DIR="${OP_BIN_DIR:-${ROOT_DIR}/.bin}"

  if [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
    if [ ! -x "${OP_BIN_DIR}/op" ]; then
      bash "${ROOT_DIR}/scripts/install-op.sh"
    fi
    export PATH="${OP_BIN_DIR}:${PATH}"
  elif ! command -v op >/dev/null 2>&1; then
    echo "error: 1Password CLI (op) is required. Install op and sign in, or set OP_SERVICE_ACCOUNT_TOKEN (Workers Builds) or ${CURSOR_OP_SERVICE_ACCOUNT_TOKEN_KEY} (Cursor Cloud Agents)." >&2
    exit 1
  fi

  if ! command -v op >/dev/null 2>&1; then
    echo "error: 1Password CLI (op) is required but could not be installed." >&2
    exit 1
  fi
}

apply_cursor_cloud_aliases

OP_ENVIRONMENT_VALUE="$(resolve_op_environment_id)"

if [ -n "${OP_ENVIRONMENT_VALUE}" ]; then
  ensure_op_cli
  exec op run --environment "${OP_ENVIRONMENT_VALUE}" -- "$@"
fi

exec "$@"
