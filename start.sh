#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${CYAN}╔═══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         PYXUS - Drone Control         ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════╝${NC}"
echo ""

# Install backend dependencies if needed
if [ ! -d "$ROOT_DIR/backend/venv" ]; then
    echo -e "${GREEN}[backend]${NC} Creating virtual environment..."
    python3 -m venv "$ROOT_DIR/backend/venv"
fi

echo -e "${GREEN}[backend]${NC} Installing dependencies..."
source "$ROOT_DIR/backend/venv/bin/activate"
pip install -q -r "$ROOT_DIR/backend/requirements.txt"

# Install frontend dependencies if needed
if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    echo -e "${GREEN}[frontend]${NC} Installing dependencies..."
    cd "$ROOT_DIR/frontend" && npm install
fi

echo ""
echo -e "${GREEN}[backend]${NC} Starting FastAPI on http://localhost:8000"
echo -e "${GREEN}[frontend]${NC} Starting Vite on http://localhost:5173"
echo ""

# Start backend
cd "$ROOT_DIR/backend"
source "$ROOT_DIR/backend/venv/bin/activate"
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Start frontend
cd "$ROOT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

# Trap to clean up on exit
cleanup() {
    echo ""
    echo -e "${CYAN}Shutting down...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
    echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT INT TERM

# Wait for either to exit
wait
