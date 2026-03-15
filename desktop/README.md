# Pyxus Desktop

Electron app wrapping a React frontend and FastAPI + pymavlink backend.

## Setup

```bash
# Start both servers (auto-installs deps on first run)
./start.sh

# Or start individually:
cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

## Structure

| Directory | Description |
|-----------|-------------|
| `backend/` | FastAPI server — MAVLink connection, telemetry, mission upload, params |
| `frontend/` | React + Vite + Tailwind — map, HUD, mission planning, settings |
| `electron/` | Electron wrapper — bundles backend + frontend for desktop distribution |

## Build

```bash
# Frontend production build
cd frontend && npx vite build

# Electron package
cd electron && npm run build
```
