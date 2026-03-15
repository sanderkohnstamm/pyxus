# MAVLink Layer

Swift MAVLink v2 implementation for pyxios. Handles framing, CRC, telemetry parsing, and the full command/mission protocol. No external dependencies.

## File Structure

```
MAVLink/
├── Generated/                          Code-generated from MAVLink XML definitions
│   ├── MAVLinkCRCExtras.swift          CRC extras table and message name map
│   ├── MAVLinkEnums.swift              MAVLink enums as Swift types
│   └── MAVLinkMessages.swift           Message structs with encode/decode
├── MAVLinkFrame.swift                  v2 frame parser (header, CRC, signing)
├── MAVLinkConnection.swift             UDP transport (connect/listen, send/receive)
├── MAVLinkModes.swift                  ArduPilot + PX4 mode maps and lookups
├── MAVLinkDrone.swift                  Core: properties, connect, telemetry, frame routing
├── MAVLinkDrone+Commands.swift         Flight commands, goto, follow, home, fence
├── MAVLinkDrone+Mission.swift          Mission upload/download protocol
├── MAVLinkDrone+Params.swift           Parameter request and set
├── MAVLinkDrone+ManualControl.swift    RC override, motor test, servo
└── MAVLinkDrone+Calibration.swift      Gyro, compass, accel, level calibration
```

## Architecture

`MAVLinkDrone` is the single entry point. It owns a `MAVLinkConnection` for UDP transport and exposes callbacks for telemetry, status text, params, command acks, calibration progress, and camera messages. All callbacks fire on the main thread.

The class is split across extension files by domain. Extensions access the connection and target system/component directly. Mission protocol uses a dedicated queue (`missionQueue`, `missionLock`, `missionSemaphore`) for blocking send/receive patterns.

### Data Flow

```
UDP frames → MAVLinkConnection → MAVLinkDrone.handleFrame()
  ├── Mission msgs → missionQueue (consumed by MissionService)
  ├── Param values → onParamValue callback
  ├── Status text  → onStatusText callback
  ├── Command acks → onCommandAck callback
  ├── Camera msgs  → onCameraMessage callback
  ├── Cal progress → onMagCalProgress / onMagCalReport callbacks
  └── Telemetry    → TelemetrySnapshot → onTelemetryUpdate callback
```

### Autopilot Support

- **ArduPilot**: Mode maps per vehicle type (copter, plane, rover, sub). Uses `REQUEST_DATA_STREAM` for telemetry rates.
- **PX4**: Unified mode map with main/sub mode encoding. Uses `SET_MESSAGE_INTERVAL`.

Autopilot type is detected from the first heartbeat (`MAV_AUTOPILOT_ARDUPILOTMEGA = 3`).

## Regenerating Generated Code

The `Generated/` directory is produced by `tools/mavlink_codegen.py` from MAVLink XML definitions. Do not edit these files by hand.
