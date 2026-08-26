#!/usr/bin/env bash
set -euo pipefail

translightNoMinify=false
if [[ "${1:-}" == "--no-minify" ]]; then
  translightNoMinify=true
  shift
fi
if [[ $# -ne 0 ]]; then
  echo "Usage: $0 [--no-minify]" >&2
  exit 2
fi

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
VITE_BIN="$PROJECT_ROOT/node_modules/.bin/vite"
USER_HOME="${HOME:-$PROJECT_ROOT}"

if [[ ! -x "$VITE_BIN" ]]; then
  echo "Missing local build dependencies. Run npm install first." >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "Missing zip command. Install zip before packaging." >&2
  exit 1
fi

cd "$PROJECT_ROOT"
TRANSLIGHT_NO_MINIFY="$translightNoMinify" npm run build

# The favicon is useful for development previews but is not an extension entry point.
rm -f "$DIST_DIR/favicon.ico"
find "$DIST_DIR" -name '.DS_Store' -type f -delete

ZIP_NAME="$(python3 "$PROJECT_ROOT/pack.py")"
ZIP_DIR="${TRANSLIGHT_ZIP_DIR:-$USER_HOME/Downloads}"
mkdir -p "$ZIP_DIR"
ZIP_DIR="$(cd -- "$ZIP_DIR" && pwd)"
ZIP_PATH="$ZIP_DIR/$ZIP_NAME"
TEMP_ZIP="$ZIP_PATH.tmp.$$"
trap 'rm -f "$TEMP_ZIP"' EXIT

(
  cd "$DIST_DIR"
  zip -qr "$TEMP_ZIP" . -x '*.DS_Store'
)

mv -f "$TEMP_ZIP" "$ZIP_PATH"

node "$PROJECT_ROOT/scripts/validate-package.mjs" \
  --project-root "$PROJECT_ROOT" \
  --dir "$DIST_DIR" \
  --zip "$ZIP_PATH"

printf 'Created %s\n' "$ZIP_PATH"
