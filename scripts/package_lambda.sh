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

find "$PACKAGE_DIR" -type f \( -name "*.map" -o -name "*.tsbuildinfo" \) -delete
find "$PACKAGE_DIR" -type d \( -iname "test" -o -iname "tests" -o -iname "__tests__" \) -prune -exec rm -rf {} +
find "$PACKAGE_DIR" -type d -empty -delete

if command -v zip >/dev/null 2>&1; then
  (cd "$PACKAGE_DIR" && zip -qr "$ZIP_PATH" .)
elif command -v powershell.exe >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
  WIN_ZIP_PATH="$(cygpath -w "$ZIP_PATH")"
  WIN_PACKAGE_DIR="$(cygpath -w "$PACKAGE_DIR")"
  powershell.exe -NoProfile -Command "\
    Add-Type -AssemblyName System.IO.Compression; \
    Add-Type -AssemblyName System.IO.Compression.FileSystem; \
    \$source = '${WIN_PACKAGE_DIR}'; \
    \$zip = '${WIN_ZIP_PATH}'; \
    if (Test-Path -LiteralPath \$zip) { Remove-Item -LiteralPath \$zip -Force }; \
    \$archive = [System.IO.Compression.ZipFile]::Open(\$zip, 'Create'); \
    try { \
      Get-ChildItem -LiteralPath \$source -Recurse -File | ForEach-Object { \
        \$relative = \$_.FullName.Substring(\$source.Length).TrimStart('\', '/'); \
        \$entryName = \$relative -replace '\\\\', '/'; \
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(\$archive, \$_.FullName, \$entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null; \
      }; \
    } finally { \
      \$archive.Dispose(); \
    }"
else
  echo "zip is required to create ${ZIP_PATH}" >&2
  exit 1
fi

echo "Created ${ZIP_PATH}"
