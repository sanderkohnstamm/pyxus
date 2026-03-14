# MAVLink Calibration, Motor Test & Servo Control

Reference for sensor calibration, motor test, and servo control protocols.
See also: [mavlink-protocol.md](mavlink-protocol.md) for core protocol details.

## Motor Test

### ArduPilot — MAV_CMD_DO_MOTOR_TEST (209)

| Param | Meaning |
|-------|---------|
| param1 | Motor instance (1-indexed) |
| param2 | Throttle type: 0=percent, 1=PWM, 2=pilot, 3=compass_cal |
| param3 | Throttle value (0-100% if type=0) |
| param4 | Timeout in seconds |
| param5 | Motor count: 0=all motors, 1=single motor |
| param6 | Test order (0=default) |

### PX4 — MAV_CMD_ACTUATOR_TEST (310)

| Param | Meaning |
|-------|---------|
| param1 | Output value (0.0-1.0 normalized) |
| param2 | Timeout in seconds |
| param5 | Actuator function: Motor1=101, Motor2=102, ..., Motor8=108 |

### Safety

- Vehicle **MUST** be disarmed
- Remove propellers before testing
- Use low throttle values (5-10%)
- Short durations (1-2s)

## Servo Control — MAV_CMD_DO_SET_SERVO (183)

Sets a servo output to a specific PWM value.

| Param | Meaning |
|-------|---------|
| param1 | Servo output number (1-16) |
| param2 | PWM value in microseconds (800-2200) |

### Standard PWM Ranges

- **Min**: 1000 µs
- **Mid/Neutral**: 1500 µs
- **Max**: 2000 µs
- Safe operating range: 800-2200 µs

## Calibration — MAV_CMD_PREFLIGHT_CALIBRATION (241)

### Calibration Types

| Type | param1 | param2 | param3 | param5 | Duration |
|------|--------|--------|--------|--------|----------|
| Gyroscope | 1 | 0 | 0 | 0 | ~5s |
| Compass | 0 | 1 | 0 | 0 | ~30s (PX4 only, ArduPilot uses 42424) |
| Barometer | 0 | 0 | 1 | 0 | ~5s |
| Accelerometer (6-pos) | 0 | 0 | 0 | 1 | ~60s |
| Level Horizon | 0 | 0 | 0 | 2 | ~5s |
| Simple Accel | 0 | 0 | 0 | 4 | ~5s |
| Cancel (all zeros) | 0 | 0 | 0 | 0 | — |

---

## ArduPilot Calibration Protocols

### Simple Calibrations (Gyro, Level, Baro)

These all follow the same COMMAND_ACK pattern:

```
GCS                          Vehicle
 │── CMD 241 (gyro/level/baro) →│
 │←── COMMAND_ACK result=5 ──── │  IN_PROGRESS
 │    (STATUSTEXT messages)      │  (informational only)
 │←── COMMAND_ACK result=0 ──── │  ACCEPTED = done!
```

**Completion detection**: `COMMAND_ACK` for command 241:
- `result=0` (ACCEPTED) → **calibration complete, success**
- `result=5` (IN_PROGRESS) → still running
- `result=4` (FAILED) → calibration failed
- `result=2` (DENIED) → vehicle is armed, disarm first

**STATUSTEXT messages are NOT used for completion detection** on ArduPilot. They are informational only. QGC uses the same approach.

### Accelerometer (6-Position Calibration)

Uses a different protocol — ArduPilot sends `COMMAND_LONG` messages to prompt for each position:

```
GCS                                   Vehicle
 │── CMD 241 (param5=1) ──────────────→│
 │←── COMMAND_LONG 42003 (param1=1) ── │  "Place Level"
 │    (user places vehicle)             │
 │── COMMAND_ACK (cmd=0, result=1) ───→│  "Confirmed"
 │←── COMMAND_LONG 42003 (param1=2) ── │  "Place Left Side"
 │    ...                               │
 │←── COMMAND_LONG 42003 (param1=6) ── │  "Place On Back"
 │── COMMAND_ACK (cmd=0, result=1) ───→│  "Confirmed"
 │←── COMMAND_LONG 42003 (param1=7) ── │  SUCCESS
```

**MAV_CMD_ACCELCAL_VEHICLE_POS (42003) param1 values:**

| param1 | Meaning |
|--------|---------|
| 1 | Level (flat on surface) |
| 2 | Left Side (left wing down) |
| 3 | Right Side (right wing down) |
| 4 | Nose Down (pitch forward) |
| 5 | Nose Up (pitch backward) |
| 6 | On Back (upside down) |
| **7** | **SUCCESS — calibration complete** |
| **8** | **FAILED — calibration failed** |

**Position confirmation**: GCS sends `COMMAND_ACK` with:
- `command = 0` (NOT the actual MAV_CMD value!)
- `result = 1`
- `target_system` = vehicle system ID
- `target_component` = vehicle component ID

### Compass (Magnetometer) — Onboard Calibration

ArduPilot compass calibration does NOT use CMD 241. It uses dedicated commands:

```
GCS                                   Vehicle
 │── Set COMPASS_CAL_FITNESS=100 ─────→│  (ensure cal succeeds)
 │── CMD 42424 (START_MAG_CAL) ───────→│  mask=0, autosave=1
 │    (user rotates vehicle)            │
 │←── MAG_CAL_PROGRESS (msg 191) ───── │  completion_pct (per compass)
 │←── MAG_CAL_PROGRESS ──────────────  │  (repeated at ~1Hz)
 │    ...                               │
 │←── MAG_CAL_REPORT (msg 192) ─────── │  per-compass result
 │←── MAG_CAL_REPORT ────────────────  │  (one per compass)
 │── Set COMPASS_LEARN=0 ─────────────→│  (post-calibration)
```

**MAV_CMD_DO_START_MAG_CAL (42424) params:**

| Param | Meaning |
|-------|---------|
| param1 | Compass bitmask (0 = all compasses) |
| param2 | Retry on failure (0 = no) |
| param3 | Autosave (1 = save on success, no accept cmd needed) |
| param4 | Delay before start (seconds) |
| param5 | Autoreboot (0 = no) |

**MAG_CAL_PROGRESS (msg 191) fields:**

| Field | Purpose |
|-------|---------|
| compass_id | Which compass (0, 1, 2) |
| cal_mask | Bitmask of active compasses (use to count total) |
| completion_pct | 0-100% for this compass |
| cal_status | 0=NOT_STARTED, 1=WAITING, 2=RUNNING_STEP_ONE, 3=RUNNING_STEP_TWO |

**MAG_CAL_REPORT (msg 192) fields:**

| Field | Purpose |
|-------|---------|
| compass_id | Which compass (0, 1, 2) |
| cal_status | **3=SUCCESS**, 4=FAILED, 5=BAD_ORIENTATION, 6=BAD_RADIUS |
| fitness | RMS fitness value (lower = better) |
| autosaved | Whether results were auto-saved |

**Multi-compass handling**: Each compass sends its own MAG_CAL_REPORT. Wait for ALL compasses to report before declaring success/failure. If ANY compass fails, the whole calibration fails.

**Critical**: Set `COMPASS_CAL_FITNESS=100` before starting. Without this, calibration may fail even with good rotation data. QGC does this. Restore original value or set `COMPASS_LEARN=0` after.

**Cancel**: Send `MAV_CMD_DO_CANCEL_MAG_CAL` (42426).

---

## PX4 Calibration Protocol

PX4 uses `MAV_CMD_PREFLIGHT_CALIBRATION` (241) with the same param mapping, but drives the state machine entirely via STATUSTEXT messages with `[cal]` prefix:

```
GCS                          Vehicle
 │── CMD 241 ──────────────→ │
 │←── STATUSTEXT "[cal]..." ─│  progress messages
 │←── STATUSTEXT "[cal]..." ─│  orientation prompts (accel)
 │    ...                     │
 │←── STATUSTEXT "[cal]..." ─│  "calibration done" or "failed"
```

**Key STATUSTEXT patterns:**
- `[cal] calibration started` — calibration is running
- `[cal] progress: XX%` — completion percentage
- `[cal] place vehicle on ...` — accel orientation prompt (PX4 auto-detects!)
- `[cal] rotate vehicle` — compass rotation prompt
- `[cal] calibration done` / `[cal] calibration passed` — **success**
- `[cal] calibration failed` / `[cal] calibration cancelled` — **failure**

**PX4 accel auto-detects orientation** — no explicit position confirmation needed. Just place the vehicle and PX4 figures out which side is down.

---

## Sensor Health — SYS_STATUS

`SYS_STATUS` (msg 1) contains `onboard_control_sensors_health` bitmask that reports sensor status:

| Value | Hex | Sensor |
|-------|-----|--------|
| 1 | 0x01 | 3D_GYRO |
| 2 | 0x02 | 3D_ACCEL |
| 4 | 0x04 | 3D_MAG |
| 8 | 0x08 | ABSOLUTE_PRESSURE (baro) |
| 32 | 0x20 | GPS |
| 128 | 0x80 | VISION_POSITION |
| 32768 | 0x8000 | BATTERY |
| 2097152 | 0x200000 | AHRS |
| 67108864 | 0x4000000 | PRE_ARM_CHECK |

Bit set = healthy. Use `onboard_control_sensors_present` to know which sensors exist, `_enabled` for which are active, and `_health` for which are healthy.

---

## Command IDs Reference

| Command | ID | Purpose |
|---|---|---|
| MAV_CMD_DO_SET_SERVO | 183 | Set servo PWM |
| MAV_CMD_DO_MOTOR_TEST | 209 | ArduPilot motor test |
| MAV_CMD_PREFLIGHT_CALIBRATION | 241 | Start sensor calibration |
| MAV_CMD_ACTUATOR_TEST | 310 | PX4 motor/actuator test |
| MAV_CMD_ACCELCAL_VEHICLE_POS | 42003 | ArduPilot accel position prompt/result |
| MAV_CMD_DO_START_MAG_CAL | 42424 | Start ArduPilot compass calibration |
| MAV_CMD_DO_ACCEPT_MAG_CAL | 42425 | Accept compass cal (not needed with autosave) |
| MAV_CMD_DO_CANCEL_MAG_CAL | 42426 | Cancel ArduPilot compass calibration |

## Key Learnings

1. **ArduPilot does NOT use STATUSTEXT for calibration completion** — use COMMAND_ACK (result=0) for simple cals, COMMAND_LONG 42003 for accel, MAG_CAL_REPORT for compass
2. **Accel positions are 1-based** (1-6 for positions, 7=success, 8=failed)
3. **Accel confirm ACK uses command=0, result=1** — not the actual command ID
4. **COMPASS_CAL_FITNESS=100 is essential** before compass cal — without it, cal may fail
5. **Multi-compass**: Wait for ALL compass reports before declaring result
6. **PX4 accel auto-detects orientation** — no position confirmation needed
7. **PX4 uses [cal] STATUSTEXT** for everything, ArduPilot uses proper MAVLink messages
8. **Always disarm before calibrating** — most cals are denied when armed
