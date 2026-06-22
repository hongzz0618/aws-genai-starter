#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_PATH="${ROOT_DIR}/build/lambda.zip"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "Missing Lambda artifact: ${ZIP_PATH}" >&2
  exit 1
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required to verify ${ZIP_PATH}" >&2
  exit 1
fi

FILE_LIST="$(unzip -Z1 "$ZIP_PATH" | tr '\\' '/')"

require_file() {
  local path="$1"
  if ! grep -Fxq "$path" <<<"$FILE_LIST"; then
    echo "Artifact missing required file: ${path}" >&2
    exit 1
  fi
}

reject_pattern() {
  local pattern="$1"
  local description="$2"
  if grep -Eq "$pattern" <<<"$FILE_LIST"; then
    echo "Artifact contains ${description}" >&2
    grep -E "$pattern" <<<"$FILE_LIST" >&2
    exit 1
  fi
}

require_file "handler.js"
require_file "package.json"
require_file "node_modules/@aws-sdk/client-bedrock-runtime/package.json"
require_file "node_modules/@aws-sdk/client-dynamodb/package.json"
require_file "node_modules/@aws-sdk/lib-dynamodb/package.json"

reject_pattern '(^|/)tests?/' "test files"
reject_pattern '\.map$' "source maps"
reject_pattern '^(src-ts|openapi|live|modules|scripts)/' "repository source directories"
reject_pattern '(^|/)(\.env(\..*)?|credentials|config|.*\.(pem|key|p12|pfx))$' "obvious secret or credential files"

if ! unzip -p "$ZIP_PATH" handler.js | grep -q "exports.handler"; then
  echo "handler.js does not export handler" >&2
  exit 1
fi

sha256sum "$ZIP_PATH"
echo "Lambda artifact verification passed"
