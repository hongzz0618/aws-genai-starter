#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build"
PACKAGE_DIR="${BUILD_DIR}/lambda"
ZIP_PATH="${BUILD_DIR}/lambda.zip"

rm -rf "$PACKAGE_DIR" "$ZIP_PATH"
mkdir -p "$PACKAGE_DIR"

if [[ "${SKIP_BUILD:-false}" != "true" ]]; then
  (cd "$ROOT_DIR" && npm run build)
fi

cp -R "${ROOT_DIR}/dist/." "$PACKAGE_DIR/"
cp "${ROOT_DIR}/package.json" "${ROOT_DIR}/package-lock.json" "$PACKAGE_DIR/"

npm ci --omit=dev --prefix "$PACKAGE_DIR"

if command -v zip >/dev/null 2>&1; then
  (cd "$PACKAGE_DIR" && zip -qr "$ZIP_PATH" .)
elif command -v powershell.exe >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
  WIN_ZIP_PATH="$(cygpath -w "$ZIP_PATH")"
  (cd "$PACKAGE_DIR" && powershell.exe -NoProfile -Command "Compress-Archive -Path * -DestinationPath '${WIN_ZIP_PATH}' -Force")
else
  echo "zip is required to create ${ZIP_PATH}" >&2
  exit 1
fi

echo "Created ${ZIP_PATH}"
