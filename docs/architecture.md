# Pyxus Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Platforms                           │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   Web    │  │   Electron   │  │       iOS         │  │
│  │ Browser  │  │  Desktop App │  │  Native SwiftUI   │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘  │
│       │               │                    │             │
│       ▼               ▼                    ▼             │
│  ┌─────────────────────────┐   ┌─────────────────────┐  │
│  │    React Frontend       │   │   MAVLinkDrone.swift │  │
│  │  Zustand + Leaflet      │   │   (direct MAVLink)  │  │
│  └────────┬────────────────┘   └──────────┬──────────┘  │
│           │ REST + WebSocket              │ UDP          │
│           ▼                               ▼              │
│  ┌─────────────────────────┐   ┌─────────────────────┐  │
│  │   FastAPI Backend       │   │  Vehicle (ArduPilot │  │
│  │  pymavlink + uvicorn    │   │       or PX4)       │  │
│  └────────┬────────────────┘   └─────────────────────┘  │
│           │ MAVLink UDP/TCP                              │
│           ▼                                              │
│  ┌─────────────────────────┐                             │
│  │  Vehicle (ArduPilot/PX4)│                             │
│  └─────────────────────────┘                             │
└─────────────────────────────────────────────────────────┘
```

## Platform Architecture

### Web / Electron (shared)

The desktop/web stack uses a client-server model:

- **Frontend** (React): UI rendering, map, user interaction. Connects to backend via REST for commands, WebSocket for real-time telemetry.
- **Backend** (FastAPI): Manages MAVLink connections via pymavlink. Handles drone registry, telemetry broadcasting, mission protocol, parameters, video proxy.
- **Electron** (optional): Spawns the Python backend as a child process, loads the React frontend in a BrowserWindow.

Data flow: `User → React → HTTP/WS → FastAPI → pymavlink → MAVLink UDP → Vehicle`

### iOS (native)

The iOS app bypasses the Python backend entirely with a pure Swift MAVLink stack:

- **SwiftUI Views**: Native flight/plan/tools interface
- **DroneManager**: Observable singleton managing connection and state
- **MAVLinkDrone**: High-level command API (arm, takeoff, missions, etc.)
- **MAVLinkConnection**: NWConnection UDP transport with frame parsing
- **Generated MAVLink code**: Message structs from `tools/mavgen_swift.py`

Data flow: `User → SwiftUI → DroneManager → MAVLinkDrone → UDP → Vehicle`

## Directory Structure

```
pyxus/
├── backend/                    Python FastAPI server
│   ├── main.py                 REST + WebSocket API (1205 lines)
│   ├── drone.py                MAVLink connection handler (1500 lines)
│   ├── mission.py              Mission upload/download protocol (469 lines)
│   ├── vehicle_profiles.py     Vehicle capability profiles (91 lines)
│   ├── bootstrap.py            iOS embedded entry point
│   └── tests/                  Unit tests
├── frontend/                   React + Vite + Tailwind
│   └── src/
│       ├── App.jsx             Desktop app root
│       ├── store/              Zustand state management
│       ├── components/         UI components (29 files)
│       ├── map/                Leaflet map layers (12 files)
│       ├── mobile/             iOS/mobile UI variant
│       ├── hooks/              WebSocket, e-stop, preflight
│       └── utils/              API, geo math, safety gates
├── electron/                   Desktop wrapper
│   └── main.js                 Electron main process
├── ios/pyxios/pyxios/          Native iOS app
│   ├── MAVLink/                Pure Swift MAVLink stack
│   │   ├── Generated/          Auto-generated (do not edit)
│   │   ├── MAVLinkFrame.swift  v2 frame parser/builder
│   │   ├── MAVLinkConnection.swift  UDP transport
│   │   └── MAVLinkDrone.swift  High-level drone API
│   ├── Views/                  SwiftUI views (Fly/Plan/Tools)
│   ├── Models/                 VehicleState, FlightPlan
│   ├── Services/               DroneManager, Bonjour, Background
│   └── Utils/                  Settings, Haptics
├── tools/
│   └── mavgen_swift.py         MAVLink XML → Swift code generator
└── sitl/                       SITL testing configs
```

## State Management

### Frontend (Zustand)

Single store (`droneStore.js`, 1092 lines) managing:

| Domain | Key State |
|--------|-----------|
| Connection | activeDroneId, drones map, connectionStrings |
| Telemetry | Per-drone telemetry (position, attitude, battery, GPS, mode) |
| Mission | Waypoints, saved missions, upload progress |
| Geofence | Circle/polygon vertices, active fence |
| UI | Active tab, theme, sidebar, map layers |
| Manual Control | RC override values, gamepad config |

Real-time updates via WebSocket with smart buffering: telemetry messages coalesced per animation frame to avoid UI thrashing.

### iOS (@Observable)

- `DroneManager.shared` - singleton, publishes `VehicleState`, `statusMessages`, `params`
- `FlightPlan` - observable mission model with persistence
- `AppSettings.shared` - user preferences via UserDefaults

### Backend (Thread-safe dicts)

- `DroneConnection._telemetry` - dict protected by `_lock`
- `DroneConnection._params` - dict protected by `_params_lock`
- `MissionManager._status` - string protected by `_lock`

## Communication Protocols

| Path | Protocol | Format |
|------|----------|--------|
| Frontend ↔ Backend | HTTP REST | JSON |
| Frontend ↔ Backend (telemetry) | WebSocket | JSON (delta-compressed) |
| Backend ↔ Vehicle | MAVLink v2 | Binary UDP |
| iOS ↔ Vehicle | MAVLink v2 | Binary UDP (NWConnection) |
| Electron ↔ Backend | HTTP (localhost:8000) | JSON |

## Multi-Drone Support

The backend maintains a registry of `DroneConnection` instances, keyed by connection string. The frontend tracks an `activeDroneId` and stores per-drone telemetry/missions. The iOS app currently supports a single connection.

## Theme System

CSS variables (`--gray-50` through `--gray-950` as RGB triples) power the dark/light theme:
- Dark mode: default `:root` values (slate palette)
- Light mode: `.light` class on root inverts the scale
- Map tiles: CartoDB `dark_all` / `light_all`
- All Tailwind gray utilities auto-adapt via custom config
