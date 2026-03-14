# Pyxus Documentation

## What is Pyxus?

Pyxus is a ground control station (GCS) for MAVLink-based drones, focused on **enhancing mission success** — giving pilots the right controls at the right time. It runs on three platforms from a shared codebase:

| Platform | Stack | Status |
|----------|-------|--------|
| **Web** | React + FastAPI | Production |
| **Desktop** | Electron + React + FastAPI | Production |
| **iOS** | Native SwiftUI + MAVLink | Active development |

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | System architecture, data flow, platform differences |
| [MAVLink Protocol Guide](mavlink-protocol.md) | MAVLink v2 wire format, protocols, ArduPilot vs PX4 differences |
| [MAVLink Calibration & Motor/Servo](mavlink-calibration-motor-servo.md) | Sensor calibration, motor test, servo control protocols |
| [MAVLink Camera Protocol](mavlink-camera-protocol.md) | Camera v2 protocol: discovery, capture, streaming, tracking |
| [iOS Native Stack](ios-native-stack.md) | Pure Swift MAVLink implementation, code generator, connection layer |

## Quick Start

```bash
# Development (web + backend)
./start.sh          # Starts backend on :8000, frontend on :5173

# Electron desktop
cd electron && npm start

# iOS
open ios/pyxios/pyxios.xcodeproj   # Build in Xcode

# Run tests
cd backend && python3 -m pytest tests/
cd frontend && npm test
```

## Key Entry Points

- `backend/main.py` - FastAPI REST + WebSocket API
- `backend/drone.py` - MAVLink connection handler
- `frontend/src/App.jsx` - Desktop UI root
- `frontend/src/mobile/MobileApp.jsx` - Mobile UI root
- `ios/pyxios/pyxios/pyxiosApp.swift` - iOS app entry
- `tools/mavgen_swift.py` - MAVLink Swift code generator
