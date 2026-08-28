#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTION_DIR="$ROOT_DIR/function"
DIST_DIR="$ROOT_DIR/dist"
ZIP_FILE="$DIST_DIR/ncp-cost-slack-alert.zip"

mkdir -p "$DIST_DIR"

if ! command -v zip >/dev/null 2>&1; then
  echo "zip command is required." >&2
  exit 1
fi

(
  cd "$FUNCTION_DIR"
  zip -r "$ZIP_FILE" __main__.py
)

echo "Created: $ZIP_FILE"
