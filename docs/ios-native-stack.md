# iOS Native MAVLink Stack

The iOS app uses a pure Swift MAVLink v2 implementation, replacing the previous MAVSDK-Swift + RxSwift dependency. This document covers the architecture, code generator, and how the stack works.

## Architecture

```
┌──────────────────────────────────────┐
│            SwiftUI Views             │
│   FlyView / PlanView / ToolsView    │
└──────────────┬───────────────────────┘
               │ @Observable
┌──────────────▼───────────────────────┐
│          DroneManager                │
│  Singleton, publishes VehicleState   │
│  Commands, mission upload, params    │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│          MAVLinkDrone                 │
│  High-level API: arm, takeoff,       │
│  missions, telemetry parsing,        │
│  ArduPilot + PX4 mode decode         │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│        MAVLinkConnection             │
│  NWConnection UDP, GCS heartbeat,    │
│  frame receive loop, send queue      │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│          MAVLinkFrame                │
│  v2 parser, CRC-16, zero-trimming,  │
│  frame builder                       │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│     Generated/ (auto-generated)      │
│  MAVLinkEnums.swift                  │
│  MAVLinkMessages.swift               │
│  MAVLinkCRCExtras.swift              │
└──────────────────────────────────────┘
```

## Code Generator: `tools/mavgen_swift.py`

Generates Swift code from MAVLink XML dialect files (e.g., `ardupilotmega.xml` which includes `common.xml`).

### Usage

```bash
cd tools
python3 mavgen_swift.py \
  --dialect /path/to/ardupilotmega.xml \
  --output ../ios/pyxios/pyxios/MAVLink/Generated/
```

### What It Generates

**MAVLinkEnums.swift** (~2500 lines, 180 enums)
- Regular enums → `enum Name: UInt32, CaseIterable`
- Bitmask enums → `struct Name: OptionSet, Sendable`
- Swift keyword escaping (backticks for `static`, `none`, `return`, etc.)
- Duplicate case disambiguation (appends `_<value>` suffix)

**MAVLinkMessages.swift** (~23000 lines, 295 messages)
- Each message is a struct with:
  - `static let id: UInt32` and `static let crcExtra: UInt8`
  - `init(from payload: Data)` — decode from wire bytes (handles field reordering)
  - `func encode() -> [UInt8]` — encode to wire bytes
- Handles signed types via `bitPattern:` conversions
- Avoids parameter name collisions (e.g., messages with a `payload` field)
- Uses closure helpers for complex multi-byte reads (prevents Swift type-checker timeouts)

**MAVLinkCRCExtras.swift** (~600 lines)
- `MAVLinkCRCExtras.table: [UInt32: UInt8]` — message ID → CRC extra byte
- `MAVLinkCRCExtras.name: [UInt32: String]` — message ID → name (for debugging)

### Generator Details

The generator handles several MAVLink complexities:

1. **Include resolution**: Recursively resolves `<include>` tags to build the full message/enum set
2. **Field reordering**: Sorts by wire size (8→4→2→1 bytes), stable within same size
3. **Extension fields**: Marked but included in struct. Decoded when present, excluded from CRC extra
4. **Type mapping**: `uint8_t`→`UInt8`, `int32_t`→`Int32`, `float`→`Float`, `double`→`Double`, `char[N]`→`String`, `uint8_t[N]`→`[UInt8]`
5. **`uint8_t_mavlink_version`**: Special type used only in HEARTBEAT, maps to `uint8_t` for CRC calculation

## MAVLinkFrame.swift

### Parser

Streaming parser that accumulates bytes and emits complete frames:

```swift
var parser = MAVLinkParser()
// Feed data from UDP
let frames = parser.parse(data: incomingData)
for frame in frames {
    print("Message \(frame.messageId) from system \(frame.systemId)")
}
```

Validates:
- Magic byte (`0xFD` for v2)
- Payload length bounds
- CRC-16/MCRF4XX with CRC extra from `MAVLinkCRCExtras.table`
- Skips packets with unknown message IDs or incompatibility flags

### Frame Builder

Constructs outgoing frames with automatic zero-trimming:

```swift
let builder = MAVLinkFrameBuilder(systemId: 255, componentId: 190)
let data = builder.build(messageId: 0, payload: heartbeatPayload)
// Sends over UDP
```

## MAVLinkConnection.swift

UDP transport using Apple's Network framework (`NWConnection` / `NWListener`).

### Modes

- **Listen mode**: Binds to port (e.g., 14550), accepts first incoming connection
- **Connect mode**: Connects to specific host:port
- **TCP mode**: TCP connection (planned, not yet implemented)

### Features

- Background receive loop dispatching parsed frames via callback
- GCS heartbeat at 1 Hz via `DispatchSourceTimer`
- State machine: idle → connecting → ready → failed
- Thread-safe send via dispatch queue

## MAVLinkDrone.swift

High-level drone API, ported from `backend/drone.py` patterns.

### Telemetry

Parses incoming frames and updates state:
- HEARTBEAT → armed state, flight mode, vehicle type, autopilot detection
- ATTITUDE → pitch, roll, yaw
- GLOBAL_POSITION_INT → lat/lon, altitude (relative + AMSL), heading
- GPS_RAW_INT → fix type, satellite count
- VFR_HUD → ground speed, vertical speed, throttle
- SYS_STATUS → battery voltage, percentage
- HOME_POSITION → home coordinate
- MISSION_CURRENT → active mission item
- STATUSTEXT → status messages with severity

### Commands

All commands use COMMAND_LONG (message ID 76):
- `arm()` / `disarm()` / `forceDisarm()`
- `takeoff(altitude:)`
- `land()` / `returnToLaunch()` / `hold()`
- `setMode(modeId:)` (ArduPilot) / `setMode(mainMode:subMode:)` (PX4)
- `gotoLocation(lat:lon:alt:)`

### Mission Protocol

Event-driven upload matching the MAVLink spec:
- `sendMissionCount()` → wait for REQUEST_INT → `sendMissionItemInt()` → repeat → wait for ACK
- `recvMissionMessage(timeout:)` — blocks on semaphore for mission queue
- `drainMissionQueue()` — clears stale messages before upload

### Mode Decoding

ArduPilot and PX4 mode tables ported from `backend/drone.py`:

```swift
enum ArduPilotModes {
    static let copter: [UInt32: String] = [
        0: "STABILIZE", 2: "ALT_HOLD", 3: "AUTO",
        4: "GUIDED", 5: "LOITER", 6: "RTL", 9: "LAND", ...
    ]
    static let plane: [UInt32: String] = [...]
    static let rover: [UInt32: String] = [...]
}
```

## DroneManager.swift

Observable singleton bridging MAVLinkDrone to SwiftUI.

### Responsibilities

- Connection management (UDP listen/connect, disconnect)
- Publishes `VehicleState` for views
- Flight actions with error handling (arm, takeoff with retry, land, RTL)
- Manual control at 10 Hz timer
- Parameter fetch/set with callback accumulation
- Mission upload on background thread with progress reporting
- Status text buffering (max 200 messages)
- Stream rate tracking (messages/sec per type)

### Connection Flow

```
ConnectView → DroneManager.connect("udp:14550")
  → MAVLinkConnection.listen(port: 14550)
    → onFrame callback routes to MAVLinkDrone.handleFrame()
      → onTelemetryUpdate callback updates DroneManager.vehicleState
        → SwiftUI views re-render
```

## File Inventory

| File | Lines | Editable? |
|------|-------|-----------|
| `Generated/MAVLinkEnums.swift` | ~2500 | No (regenerate) |
| `Generated/MAVLinkMessages.swift` | ~23000 | No (regenerate) |
| `Generated/MAVLinkCRCExtras.swift` | ~600 | No (regenerate) |
| `MAVLinkFrame.swift` | ~300 | Yes |
| `MAVLinkConnection.swift` | ~190 | Yes |
| `MAVLinkDrone.swift` | ~720 | Yes |
| `DroneManager.swift` | ~680 | Yes |
| `tools/mavgen_swift.py` | ~450 | Yes |

## Testing

Currently manual testing against ArduPilot SITL:

```bash
# Start SITL (from ardupilot directory)
sim_vehicle.py -v ArduCopter --map --console -L KSFO

# In Xcode, build and run on simulator or device
# Connect to SITL IP:14550 via ConnectView
```

Automated tests for the MAVLink layer are planned (see improvement plan).
