#!/usr/bin/env bash
#
# bundle-python-deps.sh
#
# Prepares pure-Python dependencies and Pyxus source files for
# inclusion in the iOS app bundle. Run from the repo root:
#
#   ./ios/scripts/bundle-python-deps.sh
#
# Output structure (inside ios/pyxios/pyxios/Resources/):
#   site-packages/   — pip-installed pure-Python packages
#   backend/         — backend/*.py source files
#   frontend-dist/   — pre-built frontend (from frontend/dist/)
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESOURCES="$REPO_ROOT/ios/pyxios/pyxios/Resources"

echo "==> Repo root: $REPO_ROOT"
echo "==> Resources: $RESOURCES"

# Clean previous output
rm -rf "$RESOURCES/site-packages" "$RESOURCES/backend" "$RESOURCES/frontend-dist"
mkdir -p "$RESOURCES/site-packages" "$RESOURCES/backend" "$RESOURCES/frontend-dist"

# 1. Install pure-Python dependencies
echo "==> Installing Python dependencies..."
pip install \
    --target "$RESOURCES/site-packages" \
    --no-compile \
    --no-deps \
    fastapi uvicorn pydantic httpx pymavlink 2>&1 | tail -5

echo "==> Removing .dist-info and __pycache__..."
find "$RESOURCES/site-packages" -type d -name "*.dist-info" -exec rm -rf {} + 2>/dev/null || true
find "$RESOURCES/site-packages" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

# 2. Copy backend source
echo "==> Copying backend source..."
cp "$REPO_ROOT"/backend/*.py "$RESOURCES/backend/"

# 3. Copy frontend dist (must be pre-built)
if [ -d "$REPO_ROOT/frontend/dist" ]; then
    echo "==> Copying frontend dist..."
    cp -R "$REPO_ROOT/frontend/dist/"* "$RESOURCES/frontend-dist/"
else
    echo "WARNING: frontend/dist not found — run 'cd frontend && npx vite build' first"
fi

echo "==> Done. Contents:"
echo "    site-packages: $(find "$RESOURCES/site-packages" -name '*.py' | wc -l | tr -d ' ') .py files"
echo "    backend:       $(ls "$RESOURCES/backend/"*.py 2>/dev/null | wc -l | tr -d ' ') .py files"
echo "    frontend-dist: $(find "$RESOURCES/frontend-dist" -type f 2>/dev/null | wc -l | tr -d ' ') files"
