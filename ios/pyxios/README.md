# pyxios

Native iOS ground control station for MAVLink drones. Built with SwiftUI, targeting iPhone and iPad.

## Features

- Real-time telemetry with HUD overlay (attitude, altitude, speed, GPS, battery)
- Mission planning with waypoint placement, editing, and upload/download
- Geofence configuration
- Follow Me mode using device GPS
- Gamepad support for manual control and RC override
- Motor and servo testing
- Sensor calibration (gyro, compass, accelerometer, level)
- Parameter browser and editor
- MAVLink message inspector
- Camera feed integration
- Offline map tile caching
- Bonjour auto-discovery for local drones
- Telemetry alerts and link-loss detection

## Project Structure

```
pyxios/
├── MAVLink/                MAVLink v2 protocol layer (see MAVLink/README.md)
│   ├── Generated/          Code-generated message/enum definitions
│   ├── MAVLinkFrame.swift
│   ├── MAVLinkConnection.swift
│   ├── MAVLinkModes.swift
│   └── MAVLinkDrone*.swift
├── Models/
│   ├── FlightPlan.swift    Waypoint/mission model with persistence
│   └── VehicleState.swift  Published telemetry state for SwiftUI
├── Services/
│   ├── DroneManager.swift          Singleton bridging MAVLinkDrone to SwiftUI
│   ├── MissionService.swift        Mission upload/download orchestration
│   ├── CalibrationService.swift    Calibration flow management
│   ├── ParameterService.swift      Parameter fetch and update
│   ├── TelemetryService.swift      Telemetry processing and alerts
│   ├── TelemetryAlertService.swift Alert rules for telemetry thresholds
│   ├── CameraService.swift         Camera control and video stream
│   ├── FollowMeService.swift       Follow Me with device location
│   ├── GamepadManager.swift        Game controller input handling
│   ├── BonjourDiscovery.swift      mDNS drone discovery
│   ├── BackgroundManager.swift     Background task management
│   └── CachedTileOverlay.swift     Offline map tile cache
├── Views/
│   ├── Fly/                Flight view: HUD, commands, joysticks, map, video
│   ├── Plan/               Mission planning: waypoint editor, geofence
│   ├── Map/                Map utilities (tile injection)
│   └── Tools/              Calibration, params, motor test, inspector, logs, gamepad
├── Utils/
│   ├── Settings.swift      App settings and preferences
│   └── HapticManager.swift Haptic feedback
├── ContentView.swift       Root tab navigation
└── pyxiosApp.swift         App entry point
```

## Building

```bash
cd ios/pyxios
xcodebuild -scheme pyxios -destination 'generic/platform=iOS' build
```

Requires Xcode 15+ and iOS 17+ SDK. No external package dependencies.

## Connection

pyxios connects to drones over UDP. Enter the drone's IP and MAVLink port, or use Bonjour discovery for drones advertising on the local network. The app supports both ArduPilot and PX4 autopilots, detected automatically from the first heartbeat.
