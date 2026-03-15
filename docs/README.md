# Pyxus Documentation

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | System architecture, data flow, platform differences |
| [MAVLink Protocol Guide](mavlink-protocol.md) | MAVLink v2 wire format, protocols, ArduPilot vs PX4 differences |
| [MAVLink Follow Me](mavlink-follow-me.md) | Follow Me mode protocol and implementation |
| [MAVLink Calibration & Motor/Servo](mavlink-calibration-motor-servo.md) | Sensor calibration, motor test, servo control protocols |
| [MAVLink Camera Protocol](mavlink-camera-protocol.md) | Camera v2 protocol: discovery, capture, streaming, tracking |
| [iOS Native Stack](ios-native-stack.md) | Pure Swift MAVLink implementation, code generator, connection layer |

## Quick Start

```bash
# Development (web + backend)
cd desktop && ./start.sh        # Starts backend on :8000, frontend on :5173

# Electron desktop
cd desktop/electron && npm start

# iOS
open ios/pyxios/pyxios.xcodeproj

# Mock drone for testing
./tools/run_mock.sh
```

## Key Entry Points

- `desktop/backend/main.py` — FastAPI REST + WebSocket API
- `desktop/backend/drone.py` — MAVLink connection handler
- `desktop/frontend/src/App.jsx` — Desktop UI root
- `ios/pyxios/pyxios/pyxiosApp.swift` — iOS app entry
- `tools/mavgen_swift.py` — MAVLink Swift code generator
