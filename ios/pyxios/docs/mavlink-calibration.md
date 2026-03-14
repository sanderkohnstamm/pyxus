# MAVLink Calibration Protocol Reference

## Overview

Sensor calibration uses different protocols depending on autopilot (ArduPilot vs PX4) and sensor type. This document covers the exact message flows as implemented in QGroundControl and our iOS app.

## ArduPilot

### Gyroscope / Level Horizon / Barometer (Simple Calibrations)

These all follow the same pattern:

1. **Start**: Send `MAV_CMD_PREFLIGHT_CALIBRATION` (241) with the appropriate param:
   - Gyro: `param1=1`
   - Level: `param5=2`
   - Baro: `param3=1`
2. **Progress**: Vehicle sends `COMMAND_ACK` with `result=5` (IN_PROGRESS)
3. **Completion**: Vehicle sends `COMMAND_ACK` with `result=0` (ACCEPTED) = success
4. **Failure**: `result=4` (FAILED), `result=2` (DENIED — usually means vehicle is armed)

STATUSTEXT messages are displayed for information but are **not** used for detecting completion.

### Accelerometer (6-Position Calibration)

1. **Start**: Send `MAV_CMD_PREFLIGHT_CALIBRATION` (241) with `param5=1`
2. **Position prompts**: ArduPilot sends `COMMAND_LONG` with `command=42003` (MAV_CMD_ACCELCAL_VEHICLE_POS):
   - `param1=1` → Level
   - `param1=2` → Left Side
   - `param1=3` → Right Side
   - `param1=4` → Nose Down
   - `param1=5` → Nose Up
   - `param1=6` → On Back (upside down)
3. **User confirms position**: GCS sends `COMMAND_ACK` with `command=0, result=1`
4. **Success**: ArduPilot sends `COMMAND_LONG` 42003 with `param1=7`
5. **Failure**: ArduPilot sends `COMMAND_LONG` 42003 with `param1=8`

Note: There's also a "simple" accel cal (`param5=4`) that works like gyro (just COMMAND_ACK flow).

### Compass (Magnetometer)

1. **Pre-flight**: Set `COMPASS_CAL_FITNESS=100` param (QGC does this to ensure cal succeeds)
2. **Start**: Send `MAV_CMD_DO_START_MAG_CAL` (42424):
   - `param1=0` → compass bitmask (0 = all compasses)
   - `param2=0` → retry on failure
   - `param3=1` → autosave (saves results automatically on success)
   - `param4=0` → delay
   - `param5=0` → autoreboot
3. **Progress**: Vehicle sends `MAG_CAL_PROGRESS` (msg 191) with `completion_pct` (0-100%)
4. **Completion**: Vehicle sends `MAG_CAL_REPORT` (msg 192):
   - `cal_status=3` → SUCCESS
   - `cal_status=4` → FAILED
   - `cal_status=5` → BAD_ORIENTATION
   - `cal_status=6` → BAD_RADIUS
5. **Post-cal**: Set `COMPASS_LEARN=0`
6. **Cancel**: Send `MAV_CMD_DO_CANCEL_MAG_CAL` (42426)

No `MAV_CMD_DO_ACCEPT_MAG_CAL` is needed when autosave=1.

## PX4

### All Calibrations

PX4 uses `MAV_CMD_PREFLIGHT_CALIBRATION` (241) with the same param mapping as ArduPilot, but drives the state machine via STATUSTEXT messages with `[cal]` prefix:

1. **Start**: Same CMD 241
2. **Progress**: `[cal]` prefixed STATUSTEXT messages:
   - `[cal] calibration started` / `[cal] progress: xx%`
   - `[cal] place vehicle on ...` (accel orientation prompts — PX4 auto-detects orientation)
   - `[cal] rotate vehicle` (compass)
3. **Completion**:
   - `[cal] calibration done` / `[cal] calibration passed` → success
   - `[cal] calibration failed` / `[cal] calibration cancelled` → failure

PX4 accel calibration auto-detects which side the vehicle is on — no explicit position confirmation needed.

## Message IDs Reference

| Message | ID | Purpose |
|---|---|---|
| COMMAND_LONG | 76 | Send commands / receive accel position prompts |
| COMMAND_ACK | 77 | Command results / confirm accel position |
| STATUSTEXT | 253 | PX4 [cal] messages, info display |
| MAG_CAL_PROGRESS | 191 | Compass cal completion percentage |
| MAG_CAL_REPORT | 192 | Compass cal result (success/failure/fitness) |

## Command IDs Reference

| Command | ID | Purpose |
|---|---|---|
| MAV_CMD_PREFLIGHT_CALIBRATION | 241 | Start gyro/accel/level/compass/baro cal |
| MAV_CMD_ACCELCAL_VEHICLE_POS | 42003 | ArduPilot accel position prompt (1-6) / result (7=ok, 8=fail) |
| MAV_CMD_DO_START_MAG_CAL | 42424 | Start ArduPilot compass calibration |
| MAV_CMD_DO_CANCEL_MAG_CAL | 42426 | Cancel ArduPilot compass calibration |

## Key Learnings

- **Do NOT rely on STATUSTEXT for ArduPilot calibration completion** — use COMMAND_ACK (result=0 means done) for simple cals, and COMMAND_LONG 42003 for accel
- **ArduPilot accel positions are 1-based** (1-6), not 0-based. 7=success, 8=failed
- **Accel position confirm**: Send COMMAND_ACK with `command=0, result=1` (not the actual command ID)
- **Compass needs COMPASS_CAL_FITNESS=100** set before starting, otherwise calibration may fail even with good data
- **Compass autosave=1** means no manual accept command needed
- **PX4 auto-detects accel orientation** — no position confirmation flow needed
