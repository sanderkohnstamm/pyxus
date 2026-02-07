#!/bin/bash
# Start Pyxus Electron app in development mode

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"
ELECTRON_DIR="$SCRIPT_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Pyxus...${NC}"

# Start Vite dev server in background
echo "Starting Vite dev server..."
cd "$FRONTEND_DIR"
npx vite --port 5173 &
VITE_PID=$!

# Wait for Vite to be ready
echo "Waiting for Vite..."
for i in {1..30}; do
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        echo -e "${GREEN}Vite ready${NC}"
        break
    fi
    sleep 0.5
done

# Start Electron
echo "Starting Electron..."
cd "$ELECTRON_DIR"
npm start

# Cleanup: kill Vite when Electron exits
echo "Shutting down..."
kill $VITE_PID 2>/dev/null
