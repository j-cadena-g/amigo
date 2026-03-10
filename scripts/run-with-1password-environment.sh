#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REFS_FILE="${ROOT_DIR}/.op/refs.env"
REF_KEY="OP_ENVIRONMENT_ID"

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

resolve_op_environment_id() {
  local shell_value=""
  shell_value="$(printenv "${REF_KEY}" 2>/dev/null || true)"
  if [ -n "${shell_value}" ]; then
    printf '%s' "${shell_value}"
    return 0
  fi

  if [ ! -f "${REFS_FILE}" ]; then
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
  done < "${REFS_FILE}"
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

OP_ENVIRONMENT_VALUE="$(resolve_op_environment_id)"

if [ -n "${OP_ENVIRONMENT_VALUE}" ]; then
  if ! command -v op >/dev/null 2>&1; then
    echo "error: ${REF_KEY} is set but 1Password CLI ('op') is not installed or not on PATH." >&2
    exit 1
  fi

  exec op run --environment "${OP_ENVIRONMENT_VALUE}" -- "$@"
fi

exec "$@"
