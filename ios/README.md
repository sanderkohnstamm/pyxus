# Pyxus iOS

Native SwiftUI app with a pure Swift MAVLink v2 implementation — no MAVSDK dependency.

## Setup

1. Open `pyxios/pyxios.xcodeproj` in Xcode
2. Select a development team in Signing & Capabilities
3. Build and run on device or simulator

## Build

```bash
cd pyxios && xcodebuild -scheme pyxios -destination 'generic/platform=iOS' -quiet build
```

## Key Files

| File | Description |
|------|-------------|
| `pyxios/Services/DroneManager.swift` | Singleton — telemetry, mission upload/download, params |
| `pyxios/MAVLink/MAVLinkDrone.swift` | Low-level MAVLink v2 connection and frame handling |
| `pyxios/Views/Fly/FlyView.swift` | Main flight view — HUD, actions, follow mode, joysticks |
| `pyxios/Views/Plan/PlanView.swift` | Mission planning — waypoints, geofence, upload/download |
