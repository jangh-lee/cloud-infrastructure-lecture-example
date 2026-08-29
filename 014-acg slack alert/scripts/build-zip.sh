#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTION_DIR="$ROOT_DIR/function"
DIST_DIR="$ROOT_DIR/dist"
BUILD_DIR="$ROOT_DIR/build/package"
ZIP_FILE="$DIST_DIR/ncp-acg-alert.zip"

mkdir -p "$DIST_DIR"

python3 - <<PY
import pathlib
import shutil

build_dir = pathlib.Path("$BUILD_DIR")
zip_file = pathlib.Path("$ZIP_FILE")
if build_dir.exists():
    shutil.rmtree(build_dir)
build_dir.mkdir(parents=True, exist_ok=True)
if zip_file.exists():
    zip_file.unlink()
PY

if ! command -v zip >/dev/null 2>&1; then
  echo "zip command is required." >&2
  exit 1
fi

python3 -m pip install -q --no-compile -r "$FUNCTION_DIR/requirements.txt" -t "$BUILD_DIR"
cp "$FUNCTION_DIR/main.py" "$BUILD_DIR/main.py"
cp "$FUNCTION_DIR/__main__.py" "$BUILD_DIR/__main__.py"

python3 - <<PY
import pathlib
import shutil

build_dir = pathlib.Path("$BUILD_DIR")
for cache_dir in build_dir.rglob("__pycache__"):
    shutil.rmtree(cache_dir)
for pyc_file in build_dir.rglob("*.pyc"):
    pyc_file.unlink()
PY

(
  cd "$BUILD_DIR"
  zip -r "$ZIP_FILE" .
)

echo "Created: $ZIP_FILE"
