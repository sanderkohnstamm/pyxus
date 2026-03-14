# MAVLink Protocol Guide

Reference: https://mavlink.io

This document captures MAVLink v2 protocol knowledge relevant to Pyxus development, including wire format details, service protocols, and critical differences between ArduPilot and PX4.

## MAVLink v2 Wire Format

### Frame Structure

```
Byte:  0     1      2       3       4     5      6       7-9      10..N    N+1..N+2  (opt +13)
     ┌─────┬──────┬───────┬───────┬─────┬──────┬───────┬────────┬────────┬──────────┬──────────┐
     │0xFD │ len  │incompat│compat│ seq │sysid │compid │ msgid  │payload │  CRC-16  │signature │
     │     │      │ flags  │flags │     │      │       │(3 byte)│        │(MCRF4XX) │(optional)│
     └─────┴──────┴───────┴───────┴─────┴──────┴───────┴────────┴────────┴──────────┴──────────┘
```

- **Magic byte**: `0xFD` (v2) vs `0xFE` (v1)
- **Message ID**: 3 bytes (up to 16.7M messages vs v1's 255)
- **Incompatibility flags**: Must discard packet if any unrecognized flag is set. `0x01` = signed.
- **Compatibility flags**: Can safely ignore unknown flags.

### Field Reordering

Fields in MAVLink messages are reordered by type size for transmission: **8-byte → 4-byte → 2-byte → 1-byte**. Within the same size, original XML definition order is preserved (stable sort). This prevents alignment issues on embedded systems.

**This means wire order differs from XML order.** Code generators must handle this mapping.

### CRC-16/MCRF4XX (X.25)

The checksum covers bytes 1 through N (everything except magic byte and signature). Additionally, a **CRC extra byte** is appended during calculation — this is a hash of the message definition ensuring sender and receiver agree on the schema.

**CRC extra calculation:**
1. Start CRC over the message name string (e.g., "HEARTBEAT")
2. For each field (in wire-sorted order, base fields only — no extensions):
   - Accumulate the type name (e.g., "uint32_t")
   - Accumulate the field name (e.g., "custom_mode")
   - If array: accumulate array length as single byte
3. Take `(crc & 0xFF) ^ (crc >> 8)` as the CRC extra byte

**Important**: The CRC extra does NOT include payload length. Extension fields are excluded from the CRC extra but included in the payload.

### Payload Zero-Trimming

MAVLink v2 removes trailing zero bytes from payloads before transmission. The `len` field reflects actual bytes sent. Receivers must zero-fill to the full message size when decoding. This typically saves 30-50% bandwidth.

### Signing (Optional)

13-byte signature appended after CRC when incompatibility flag `0x01` is set: `link_id(1) + timestamp(6) + signature(6)`. Pyxus currently does not implement signing.

## Heartbeat Protocol

**The most critical MAVLink message.** Without heartbeats, vehicles won't accept commands.

### Requirements

- GCS **must** send heartbeats at 1 Hz, even when not commanding
- Vehicle considered disconnected after **4-5 missed heartbeats** (~5 seconds)
- ArduPilot specifically requires GCS heartbeat to enable some features

### Fields

| Field | Purpose |
|-------|---------|
| `type` | `MAV_TYPE_GCS` (6) for ground stations |
| `autopilot` | `MAV_AUTOPILOT_INVALID` (8) for non-vehicle components |
| `base_mode` | 0 for GCS |
| `custom_mode` | 0 for GCS |
| `system_status` | `MAV_STATE_ACTIVE` (4) |

### Autopilot Detection

Identify the autopilot from the vehicle's heartbeat:
- `autopilot == 3` → ArduPilot (MAV_AUTOPILOT_ARDUPILOTMEGA)
- `autopilot == 12` → PX4 (MAV_AUTOPILOT_PX4)
- Check `autopilot != MAV_AUTOPILOT_INVALID` to identify flight controllers

## Command Protocol

### COMMAND_LONG vs COMMAND_INT

| | COMMAND_LONG | COMMAND_INT |
|-|-------------|-------------|
| Parameters | 7 floats | 4 floats + frame + 2 ints + 1 float |
| Lat/Lon precision | ~1.1m at equator | ~1.1cm at equator |
| Use for | Non-positional commands | Navigation/positional commands |

**Rule of thumb**: Use COMMAND_INT for anything involving coordinates. Use COMMAND_LONG for everything else (arm, disarm, set mode, calibrate, etc.).

### Acknowledgment Flow

```
GCS                          Vehicle
 │── COMMAND_LONG ──────────→ │
 │                             │ (validates, starts execution)
 │←── COMMAND_ACK ────────── │  MAV_RESULT_ACCEPTED
 │                             │ (or MAV_RESULT_IN_PROGRESS with %)
 │←── COMMAND_ACK ────────── │  MAV_RESULT_ACCEPTED (final)
```

**MAV_RESULT codes:**
- `ACCEPTED` (0) — will execute (not "completed")
- `TEMPORARILY_REJECTED` (1) — busy, try again
- `DENIED` (2) — not allowed in current state
- `FAILED` (4) — execution failed
- `IN_PROGRESS` (5) — long-running, with progress %
- `COMMAND_INT_ONLY` (7) / `COMMAND_LONG_ONLY` (8) — wrong message type

### Retry Logic

- Timeout: 1500ms default
- Retries: up to 5 attempts
- Increment `confirmation` field on each retry

## Mission Protocol

### Upload Flow

```
GCS                          Vehicle
 │── MISSION_COUNT ──────────→│  (N items, mission_type)
 │                              │
 │←── MISSION_REQUEST_INT ───│  seq=0
 │── MISSION_ITEM_INT ───────→│  seq=0
 │←── MISSION_REQUEST_INT ───│  seq=1
 │── MISSION_ITEM_INT ───────→│  seq=1
 │   ...                        │
 │←── MISSION_ACK ───────────│  MAV_MISSION_ACCEPTED
```

### Download Flow

```
GCS                          Vehicle
 │── MISSION_REQUEST_LIST ───→│
 │←── MISSION_COUNT ─────────│  N items
 │── MISSION_REQUEST_INT ────→│  seq=0
 │←── MISSION_ITEM_INT ──────│  seq=0
 │   ...                        │
 │── MISSION_ACK ────────────→│  MAV_MISSION_ACCEPTED
```

### Mission Types

| Type | Value | Description |
|------|-------|-------------|
| MAV_MISSION_TYPE_MISSION | 0 | Flight plan (waypoints, commands) |
| MAV_MISSION_TYPE_FENCE | 1 | Geofence definitions |
| MAV_MISSION_TYPE_RALLY | 2 | Rally/safe points for RTL |

### Critical ArduPilot vs PX4 Differences

| Aspect | ArduPilot | PX4 |
|--------|-----------|-----|
| **Sequence 0** | Home position (auto-populated, read-only) | First mission item |
| **User items start at** | seq 1 | seq 0 |
| **Atomicity** | Non-atomic — failure may leave mixed old/new | Atomic uploads |
| **Upload cancellation** | Allowed (NACK doesn't terminate) | Not implemented |
| **Field rounding** | May round coords; re-download may differ | Exact storage |
| **Clear during flight** | Cannot clear in Auto mode | Allowed |

### Coordinate Frames

**Always use `MAV_FRAME_GLOBAL_RELATIVE_ALT_INT`** (3) for mission items with lat/lon. The `_INT` variants encode lat/lon as `degrees * 1e7` (integers), avoiding float precision loss.

- `MAV_FRAME_GLOBAL` (0) — altitude above MSL
- `MAV_FRAME_GLOBAL_RELATIVE_ALT` (3) — altitude relative to home
- `MAV_FRAME_GLOBAL_TERRAIN_ALT` (10) — altitude above terrain (if terrain data available)
- `MAV_FRAME_MISSION` (2) — used for non-positional items only (e.g., DO_SET_MODE, ROI with separate coords)

### Timeouts

- Overall upload timeout: implementation-defined (Pyxus uses 30s)
- Per-item timeout: 250ms recommended
- Max retries: 5

## Parameter Protocol

### Read All Parameters

```
GCS                          Vehicle
 │── PARAM_REQUEST_LIST ─────→│
 │←── PARAM_VALUE ────────────│  index=0, count=N
 │←── PARAM_VALUE ────────────│  index=1, count=N
 │   ...                        │
 │←── PARAM_VALUE ────────────│  index=N-1, count=N
```

### Set a Parameter

```
GCS                          Vehicle
 │── PARAM_SET ──────────────→│  (name, value, type)
 │←── PARAM_VALUE ────────────│  (actual stored value — may differ!)
```

The response PARAM_VALUE contains the **actual stored value**, which may differ from what was sent (e.g., due to range clamping). Always use the response to update your cache.

### ArduPilot vs PX4 Differences

| Aspect | ArduPilot | PX4 |
|--------|-----------|-----|
| **Encoding** | C-style float cast (precision loss > 24-bit ints) | Byte-wise (preserves precision) |
| **ACK on SET** | Does NOT broadcast PARAM_VALUE after SET (non-compliant!) | Broadcasts PARAM_VALUE |
| **Types** | Determined by name lookup, ignores message type field | INT32 and FLOAT only |
| **Caching** | No hash support | CRC32 hash for cache validation |

### Gotchas

- Parameter names: max 16 chars, null-terminated
- Values encoded as float with type hint — beware precision loss for large integers
- Parameter set should not change after boot. Index-based access unreliable if it does.
- Dropped PARAM_VALUE messages mean cache goes stale with no notification

## Data Streams

ArduPilot and PX4 use different mechanisms for requesting telemetry streams:

### ArduPilot: REQUEST_DATA_STREAM

```python
# Request all streams at specific rates
mav.request_data_stream_send(target, comp,
    MAV_DATA_STREAM_ALL, rate_hz, 1)  # 1 = start
```

Stream groups: RAW_SENSORS, EXTENDED_STATUS, RC_CHANNELS, RAW_CONTROLLER, POSITION, EXTRA1 (attitude), EXTRA2 (VFR_HUD), EXTRA3 (battery).

### PX4: SET_MESSAGE_INTERVAL

```python
# Request individual messages at specific intervals
mav.command_long_send(target, comp,
    MAV_CMD_SET_MESSAGE_INTERVAL,
    0, message_id, interval_us, 0,0,0,0,0)
```

PX4 prefers per-message interval control. More flexible but requires knowing which message IDs you want.

## Flight Mode Decoding

Flight modes are encoded in `HEARTBEAT.custom_mode` but interpreted completely differently:

### ArduPilot

`custom_mode` is a direct enum value. Each vehicle type has its own mode table:

| Copter Mode | Value | Plane Mode | Value | Rover Mode | Value |
|-------------|-------|------------|-------|------------|-------|
| STABILIZE | 0 | MANUAL | 0 | MANUAL | 0 |
| ACRO | 1 | CIRCLE | 1 | ACRO | 1 |
| ALT_HOLD | 2 | STABILIZE | 2 | STEERING | 3 |
| AUTO | 3 | TRAINING | 3 | HOLD | 4 |
| GUIDED | 4 | ACRO | 4 | LOITER | 5 |
| LOITER | 5 | FBWA | 5 | FOLLOW | 6 |
| RTL | 6 | FBWB | 6 | AUTO | 10 |
| CIRCLE | 7 | CRUISE | 7 | RTL | 11 |
| LAND | 9 | AUTOTUNE | 8 | GUIDED | 15 |
| DRIFT | 11 | AUTO | 10 | | |
| SPORT | 13 | RTL | 11 | | |
| POSHOLD | 16 | LOITER | 12 | | |
| BRAKE | 17 | GUIDED | 15 | | |
| SMART_RTL | 21 | QSTABILIZE | 17 | | |
| AUTO_RTL | 25 | QHOVER | 18 | | |

### PX4

`custom_mode` is a packed 32-bit value: `main_mode << 16 | sub_mode << 24`

| Main Mode | Value | Sub Modes |
|-----------|-------|-----------|
| MANUAL | 1 | — |
| ALTCTL | 2 | — |
| POSCTL | 3 | — |
| AUTO | 4 | READY(1), TAKEOFF(2), LOITER(3), MISSION(4), RTL(5), LAND(6) |
| ACRO | 5 | — |
| OFFBOARD | 6 | — |
| STABILIZED | 7 | — |

## Common MAVLink Commands Used by Pyxus

| Command | ID | Usage |
|---------|----|-------|
| MAV_CMD_NAV_WAYPOINT | 16 | Mission waypoint |
| MAV_CMD_NAV_LOITER_UNLIM | 17 | Loiter indefinitely |
| MAV_CMD_NAV_LOITER_TURNS | 18 | Loiter for N turns |
| MAV_CMD_NAV_RETURN_TO_LAUNCH | 20 | RTL |
| MAV_CMD_NAV_LAND | 21 | Land at position |
| MAV_CMD_NAV_TAKEOFF | 22 | Takeoff to altitude |
| MAV_CMD_DO_SET_MODE | 176 | Change flight mode |
| MAV_CMD_DO_SET_ROI_LOCATION | 195 | Point camera at location |
| MAV_CMD_DO_CHANGE_SPEED | 178 | Set target speed |
| MAV_CMD_COMPONENT_ARM_DISARM | 400 | Arm/disarm (param1: 1=arm, 0=disarm; param2: 21196=force) |
| MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION | 5001 | Polygon fence vertex |
| MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION | 5003 | Circle fence |
| MAV_CMD_REQUEST_MESSAGE | 512 | Request specific message once |
| MAV_CMD_SET_MESSAGE_INTERVAL | 511 | Set stream rate (PX4) |

## Telemetry Messages

| Message | ID | Key Fields | Typical Rate |
|---------|----|-----------|-------------|
| HEARTBEAT | 0 | type, autopilot, base_mode, custom_mode, system_status | 1 Hz |
| ATTITUDE | 30 | roll, pitch, yaw, rollspeed, pitchspeed, yawspeed | 4-10 Hz |
| GLOBAL_POSITION_INT | 33 | lat, lon, alt, relative_alt, vx, vy, vz, hdg | 4 Hz |
| GPS_RAW_INT | 24 | fix_type, lat, lon, alt, satellites_visible, eph, epv | 2-4 Hz |
| VFR_HUD | 74 | airspeed, groundspeed, heading, throttle, alt, climb | 4 Hz |
| SYS_STATUS | 1 | voltage_battery, current_battery, battery_remaining | 1-2 Hz |
| BATTERY_STATUS | 147 | voltages, current_battery, battery_remaining, temperature | 1-2 Hz |
| RC_CHANNELS | 65 | chan1_raw..chan18_raw, chancount, rssi | 4 Hz |
| HOME_POSITION | 242 | latitude, longitude, altitude | On change |
| STATUSTEXT | 253 | severity, text | Event-driven |
| MISSION_CURRENT | 42 | seq, total, mission_state | On change |
| COMMAND_LONG | 76 | command, param1-7 | Event-driven |
| COMMAND_ACK | 77 | command, result, progress | Event-driven |
| MAG_CAL_PROGRESS | 191 | compass_id, completion_pct, cal_mask | ~1 Hz (during cal) |
| MAG_CAL_REPORT | 192 | compass_id, cal_status, fitness | End of cal |

## Manual Control (MANUAL_CONTROL — msg 69)

Used to send joystick/gamepad inputs directly to the vehicle.

| Field | Range | Purpose |
|-------|-------|---------|
| `x` | -1000..1000 | Pitch (forward/back) |
| `y` | -1000..1000 | Roll (left/right) |
| `z` | 0..1000 | Throttle (ArduPilot: 0=min, 500=mid, 1000=max) |
| `r` | -1000..1000 | Yaw (rotation left/right) |
| `buttons` | bitmask | Joystick button states |
| `target` | uint8 | Target system ID |

### Throttle Mapping

ArduPilot maps the `z` field differently depending on flight mode:
- **Copter modes (ALT_HOLD, LOITER, POSHOLD)**: `z=500` = hover/neutral, `z<500` = descend, `z>500` = climb
- **Copter modes (STABILIZE)**: `z=0` = zero throttle, `z=1000` = full throttle
- **Guided/Auto**: Throttle is ignored (autopilot controls it)

PX4 uses -1000..1000 for throttle (`z`) with 0 = neutral in altitude-controlled modes.

### Rate

Send at **10 Hz minimum** for responsive control. ArduPilot ignores MANUAL_CONTROL if no GCS heartbeat is active. MANUAL_CONTROL only works when the vehicle is in a mode that accepts manual input.

## SYS_STATUS Sensor Health (msg 1)

`SYS_STATUS` contains three bitmask fields for onboard sensors:

| Field | Purpose |
|-------|---------|
| `onboard_control_sensors_present` | Which sensors exist on the vehicle |
| `onboard_control_sensors_enabled` | Which sensors are active |
| `onboard_control_sensors_health` | Which sensors are healthy (bit set = OK) |

### MAV_SYS_STATUS_SENSOR Bits

| Bit | Hex | Sensor |
|-----|-----|--------|
| 0 | 0x01 | 3D_GYRO (gyroscope) |
| 1 | 0x02 | 3D_ACCEL (accelerometer) |
| 2 | 0x04 | 3D_MAG (magnetometer/compass) |
| 3 | 0x08 | ABSOLUTE_PRESSURE (barometer) |
| 4 | 0x10 | DIFFERENTIAL_PRESSURE (airspeed) |
| 5 | 0x20 | GPS |
| 6 | 0x40 | OPTICAL_FLOW |
| 7 | 0x80 | VISION_POSITION |
| 8 | 0x100 | LASER_POSITION (rangefinder) |
| 10 | 0x400 | 3D_GYRO2 |
| 11 | 0x800 | 3D_ACCEL2 |
| 12 | 0x1000 | 3D_MAG2 |
| 15 | 0x8000 | BATTERY |
| 21 | 0x200000 | AHRS |
| 25 | 0x2000000 | LOGGING |
| 26 | 0x4000000 | PRE_ARM_CHECK |

**Usage**: Check `present & enabled & health` for each bit. Bit set in `health` = sensor OK. Use this to show calibration status (gyro/accel/mag health indicates calibration state).

**Note**: The actual bit assignments differ slightly between firmware versions. The bits above are for the sensors Pyxus currently monitors. Always cross-check with https://mavlink.io/en/messages/common.html#MAV_SYS_STATUS_SENSOR for the full list.

## Vehicle Types (MAV_TYPE)

From `HEARTBEAT.type`:

| Value | Type | Description |
|-------|------|-------------|
| 0 | GENERIC | Generic micro air vehicle |
| 1 | FIXED_WING | Fixed wing aircraft (plane) |
| 2 | QUADROTOR | Quadrotor |
| 3 | COAXIAL | Coaxial helicopter |
| 4 | HELICOPTER | Normal helicopter |
| 6 | GCS | Ground control station |
| 10 | GROUND_ROVER | Ground rover |
| 11 | SURFACE_BOAT | Surface vessel/boat |
| 12 | SUBMARINE | Submarine |
| 13 | HEXAROTOR | Hexarotor |
| 14 | OCTOROTOR | Octorotor |
| 15 | TRICOPTER | Tricopter |
| 20 | VTOL_TAILSITTER_DUOROTOR | VTOL tailsitter |
| 21 | VTOL_TAILSITTER_QUADROTOR | VTOL tiltrotor |
| 22 | VTOL_TILTROTOR | VTOL tiltrotor |
| 29 | VTOL_FIXEDROTOR | VTOL fixed rotor |

### Pyxus Vehicle Classification

Pyxus groups MAV_TYPE values into three categories for UI purposes:
- **Plane**: type == 1
- **Rover**: type == 10, 11
- **Copter**: everything else (default)

This affects which flight mode table is used for decoding `custom_mode`.

## System Status (MAV_STATE)

From `HEARTBEAT.system_status`:

| Value | State | Meaning |
|-------|-------|---------|
| 0 | UNINIT | Uninitialized, booting |
| 1 | BOOT | Booting up |
| 2 | CALIBRATING | Running calibration |
| 3 | STANDBY | On ground, ready |
| 4 | ACTIVE | Flying / in motion |
| 5 | CRITICAL | Critical failure (may RTL) |
| 6 | EMERGENCY | Emergency (may land) |
| 8 | FLIGHT_TERMINATION | Terminating flight |

**Landed detection**: A vehicle is considered "on the ground" if `system_status <= 3` (STANDBY or below) OR if not armed.

## Link Loss Detection

### GCS Side

The GCS monitors the time since the last received message from the vehicle:
- **Healthy**: Messages arriving at expected rates
- **Link lost**: No messages for > 3-5 seconds (configurable)
- **Recovery**: First message received after link loss clears the state

### Implementation Pattern

Track `lastMessageTime` on every received frame. A periodic check (e.g., 2 Hz) compares `now - lastMessageTime` against a threshold. If exceeded, set `linkLost = true` which the UI surfaces as a warning banner.

### Vehicle Side

ArduPilot triggers GCS failsafe if no GCS heartbeat for `FS_GCS_TIMEOUT` seconds (default 5). Behavior depends on `FS_GCS_ENABLE`:
- 0 = Disabled
- 1 = RTL
- 2 = Continue mission in Auto, RTL otherwise
- 3 = SmartRTL or RTL
- 4 = SmartRTL or Land

## Arm/Disarm Protocol

### Arm
```
COMMAND_LONG: MAV_CMD_COMPONENT_ARM_DISARM (400)
  param1 = 1 (arm)
  param2 = 0 (normal) or 21196 (force arm, bypasses pre-arm checks)
```

### Disarm
```
COMMAND_LONG: MAV_CMD_COMPONENT_ARM_DISARM (400)
  param1 = 0 (disarm)
  param2 = 0 (normal) or 21196 (force disarm, even in flight!)
```

**Warning**: Force disarm (`param2=21196`) while flying will immediately cut motors. Only use in emergencies.

### Armed State Detection

`HEARTBEAT.base_mode & 0x80` (MAV_MODE_FLAG_SAFETY_ARMED). Bit set = armed.

## Takeoff Protocol

### ArduPilot Copter
1. Set mode to GUIDED: `MAV_CMD_DO_SET_MODE` with `custom_mode=4`
2. Arm: `MAV_CMD_COMPONENT_ARM_DISARM` param1=1
3. Takeoff: `MAV_CMD_NAV_TAKEOFF` param7=altitude_meters

### PX4
1. Set mode to TAKEOFF: `custom_mode` with main=4, sub=2
2. Arm
3. Vehicle takes off automatically in TAKEOFF mode

### Common Issues
- Takeoff denied if pre-arm checks fail (GPS lock, calibration, etc.)
- ArduPilot requires GUIDED mode for command-based takeoff
- Altitude is relative to home position
