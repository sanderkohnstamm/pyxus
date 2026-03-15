# MAVLink Follow Me Protocol

Reference:
- https://mavlink.io/en/messages/common.html#FOLLOW_TARGET
- https://docs.px4.io/main/en/flight_modes_mc/follow_me
- https://ardupilot.org/copter/docs/follow-mode.html

This document captures the Follow Me protocol for both PX4 and ArduPilot, including the FOLLOW_TARGET message format, autopilot parameters, and implementation notes for Pyxus.

## FOLLOW_TARGET Message (#144)

The GCS continuously broadcasts its position to the drone. The drone uses this to maintain a configurable offset relative to the target.

### Wire Format (93 bytes, CRC extra: 127)

Fields are transmitted in **wire order** (MAVLink type-size reordering):

| Wire Order | Field | Type | Description |
|---|---|---|---|
| 0 | `timestamp` | uint64_t | Timestamp (ms since boot or Unix epoch) |
| 1 | `custom_state` | uint64_t | Button/switch state bitmask (0 if unused) |
| 2 | `lat` | int32_t | Latitude in degE7 (e.g., 47.123456 = 471234560) |
| 3 | `lon` | int32_t | Longitude in degE7 |
| 4 | `alt` | float | Altitude in meters (AMSL for PX4 3D mode, relative otherwise) |
| 5 | `vel` | float[3] | Target velocity [vx, vy, vz] in m/s NED (0 if unknown) |
| 6 | `acc` | float[3] | Target acceleration [ax, ay, az] in m/s^2 NED (0 if unknown) |
| 7 | `attitude_q` | float[4] | Quaternion [w, x, y, z] of target heading (identity [1,0,0,0] if unknown) |
| 8 | `rates` | float[3] | Angular rates [rollspeed, pitchspeed, yawspeed] in rad/s (0 if unknown) |
| 9 | `position_cov` | float[3] | Position covariance [x, y, z] (0 if unknown) |
| 10 | `est_capabilities` | uint8_t | Bitmask of valid fields (see below) |

### est_capabilities Bitmask

| Bit | Value | Meaning |
|-----|-------|---------|
| 0 | 1 | POS — lat/lon/alt are valid |
| 1 | 2 | VEL — vel array is valid |
| 2 | 4 | ACCEL — acc array is valid |
| 3 | 8 | ATT — attitude_q is valid |

For basic Follow Me using only GPS position, set `est_capabilities = 1` (POS only). Providing velocity improves tracking responsiveness but is not required.

### Send Rate

Send at **1–2 Hz** minimum. PX4 applies a configurable filter (FLW_TGT_RS) to smooth incoming positions. ArduPilot uses FOLL_POS_P gain to control responsiveness.

### Altitude Warning

QGroundControl on Android sends altitude relative to the **GPS ellipsoid**, not AMSL. This can differ by up to 200m depending on location. PX4 3D tracking mode (FLW_TGT_ALT_M=2) uses the raw alt field — avoid with Android GCS unless corrected.

For 2D tracking (default), the alt field is ignored and the drone holds a fixed height relative to home.

---

## PX4 Follow Me Mode

### Activation

Switch the drone to **Follow Me** flight mode. The drone will:
1. Wait for FOLLOW_TARGET messages
2. Take off automatically if on the ground (to FLW_TGT_HT altitude)
3. Maintain configurable offset relative to the target

### Parameters

| Parameter | Default | Range | Description |
|---|---|---|---|
| `FLW_TGT_HT` | 8 m | >= 8 | Follow height relative to **home/arming position** (not target) |
| `FLW_TGT_DST` | 8 m | >= 1 | Horizontal separation distance from target |
| `FLW_TGT_FA` | 0 deg | -180 to 180 | Follow angle: 0 = behind target, 90 = right, -90 = left, 180 = in front |
| `FLW_TGT_ALT_M` | 0 | 0–2 | Altitude mode (see below) |
| `FLW_TGT_MAX_VEL` | 10 m/s | — | Maximum orbital velocity around target |
| `FLW_TGT_RS` | — | 0.0–1.0 | Filter responsiveness (0 = smooth/slow, 1 = raw/fast) |

### Altitude Modes (FLW_TGT_ALT_M)

| Value | Mode | Behavior |
|-------|------|----------|
| 0 | 2D Tracking | Fixed height relative to home (uses FLW_TGT_HT) |
| 1 | 2D + Terrain | Height above ground using rangefinder |
| 2 | 3D Tracking | Follows target's GPS altitude from FOLLOW_TARGET.alt |

### RC Stick Adjustments (while active)

- **Throttle**: Adjust follow height
- **Pitch**: Adjust follow distance
- **Roll**: Adjust follow angle

### Safety

- Enforces minimum 1m altitude
- Requires valid local position estimate (GPS or other)

---

## ArduPilot Follow Mode

### Activation

Switch the drone to **FOLLOW** flight mode. ArduPilot Copter 3.6+ supports this natively using FOLLOW_TARGET messages.

**Important**: This is different from the older **Mission Planner "Follow Me"** feature (documented at `ac2_followme.html`), which used GUIDED mode with continuous goto commands from the GCS. The modern FOLLOW mode is autopilot-native and uses FOLLOW_TARGET.

### Parameters

| Parameter | Default | Range | Description |
|---|---|---|---|
| `FOLL_ENABLE` | 0 | 0/1 | Enable follow mode (refresh params after changing) |
| `FOLL_SYSID` | 0 | 0–255 | MAVLink system ID to follow. 0 = first detected. |
| `FOLL_OFS_X` | 0 | meters | Offset in X (forward in NED or relative to lead heading) |
| `FOLL_OFS_Y` | 0 | meters | Offset in Y (right in NED or relative to lead heading) |
| `FOLL_OFS_Z` | 0 | meters | Offset in Z (down, so negative = above) |
| `FOLL_OFS_TYPE` | 0 | 0/1 | 0 = NED offsets, 1 = relative to lead vehicle heading |
| `FOLL_ALT_TYPE` | 0 | 0/1 | 0 = relative to home altitude, 1 = AMSL |
| `FOLL_DIST_MAX` | 100 | meters | Max distance before giving up pursuit (holds position) |
| `FOLL_YAW_BEHAV` | 0 | 0/1 | 0 = match lead heading, 1 = face toward lead |
| `FOLL_POS_P` | 0.1 | — | Position tracking P gain (higher = more aggressive) |
| `FOLL_OPTIONS` | 0 | bitmask | Bit 0: gimbal/mount tracks lead vehicle |

### Offset Coordinate System

When `FOLL_OFS_TYPE = 0` (NED):
- X = North, Y = East, Z = Down
- Offsets are fixed to compass directions regardless of lead heading

When `FOLL_OFS_TYPE = 1` (relative):
- X = forward (in lead's heading direction)
- Y = right (relative to lead's heading)
- Z = down
- Offsets rotate with the lead vehicle — useful for "follow behind" behavior

### Speed Constraints

Horizontal pursuit speed is limited by `WP_SPD` parameter. Vertical speed limited by `PILOT_SPD_UP` / `PILOT_SPD_DN` (default ~2.5 m/s).

---

## Pyxus Implementation Notes

### Architecture

- **Desktop (React → Python backend → MAVLink)**: Browser geolocation provides GCS position. Frontend sends position to backend via REST API at 2Hz. Backend sends FOLLOW_TARGET via pymavlink.
- **iOS (Swift → MAVLink directly)**: CLLocationManager provides device position. FollowMeService sends FOLLOW_TARGET directly via MAVLinkDrone connection.

### pymavlink Send Example

```python
mav.mav.follow_target_send(
    int(time.time() * 1000),   # timestamp (ms)
    1,                          # est_capabilities (POS valid)
    int(lat * 1e7),             # lat (degE7)
    int(lon * 1e7),             # lon (degE7)
    alt,                        # alt (meters, AMSL or relative)
    [0, 0, 0],                  # vel (not provided)
    [0, 0, 0],                  # acc (not provided)
    [1, 0, 0, 0],              # attitude_q (identity = unknown)
    [0, 0, 0],                  # rates (not provided)
    [0, 0, 0],                  # position_cov (not provided)
    0                           # custom_state
)
```

### iOS Swift Send Example

```swift
var msg = MsgFollowTarget()
msg.timestamp = UInt64(Date().timeIntervalSince1970 * 1000)
msg.est_capabilities = 1  // POS
msg.lat = Int32(location.coordinate.latitude * 1e7)
msg.lon = Int32(location.coordinate.longitude * 1e7)
msg.alt = Float(location.altitude) + heightOffset
msg.attitude_q = [1, 0, 0, 0]  // identity
drone.connection.sendMessage(id: MsgFollowTarget.id, payload: msg.encode())
```

### Mode Switching

| Autopilot | Enter Follow | Exit Follow |
|-----------|-------------|-------------|
| ArduPilot | Set mode to `FOLLOW` | Set mode to `LOITER` |
| PX4 | Set mode to Follow Me (standard mode via MAV_CMD_DO_SET_MODE) | Set mode to `AUTO_LOITER` (Hold) |

### Safety Considerations

1. **Require armed + airborne** before enabling follow me
2. **Auto-disable** on disarm, disconnect, or link loss
3. **Warn on poor GPS** accuracy (> 50m)
4. **Configurable settings** (height, distance, angle) persist per platform
5. ArduPilot's `FOLL_DIST_MAX` provides a hardware-level safety net
6. PX4 enforces 1m minimum altitude

### Configurable Settings (Pyxus UI)

| Setting | Default | Description |
|---------|---------|-------------|
| Follow Height | 20 m | Altitude above GCS position |
| Follow Distance | 10 m | Horizontal separation |
| Follow Angle | 0 deg | 0 = behind, 90 = right, 180 = front |

These map to:
- **PX4**: FLW_TGT_HT, FLW_TGT_DST, FLW_TGT_FA (set via MAV_CMD_PARAM_SET or pre-configured)
- **ArduPilot**: FOLL_OFS_X/Y/Z computed from distance + angle (with FOLL_OFS_TYPE=1 for heading-relative)

### Converting Distance + Angle to ArduPilot Offsets

With `FOLL_OFS_TYPE = 1` (heading-relative):
```
FOLL_OFS_X = -distance * cos(angle_rad)   # negative = behind
FOLL_OFS_Y = distance * sin(angle_rad)     # positive = right
FOLL_OFS_Z = -height                        # negative = above
```

Where `angle_rad = angle_degrees * pi / 180`, and angle 0 = directly behind the target.
