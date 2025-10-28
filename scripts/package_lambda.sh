#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build"

mkdir -p "$BUILD_DIR"
zip -j "${BUILD_DIR}/lambda.zip" "${ROOT_DIR}/src/app.py" >/dev/null
echo "Created ${BUILD_DIR}/lambda.zip"