# Pyxus

Ground control station for MAVLink drones. Desktop (Electron + React + Python) and iOS (native SwiftUI + MAVLink v2).

## Quick Start

```bash
# Desktop — start backend + frontend dev servers
cd desktop && ./start.sh

# Mock drone for testing
./tools/run_mock.sh
```

## Directory Structure

| Directory | Description |
|-----------|-------------|
| `desktop/` | Desktop app — Electron wrapper, React frontend, FastAPI backend |
| `ios/` | Native iOS app — SwiftUI + pure Swift MAVLink v2 stack |
| `tools/` | Dev tools — mock drone simulator, Swift MAVLink code generator |
| `docs/` | Architecture and protocol documentation |

## Key Files

- `PROJECT.md` — Roadmap, priorities, and current state
- `CLAUDE.md` — AI assistant project instructions
