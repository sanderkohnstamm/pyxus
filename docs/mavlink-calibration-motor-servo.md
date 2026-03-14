# MAVLink Calibration, Motor Test & Servo Test

Reference for calibration flows, motor test, and servo control used in pyxus iOS and desktop apps.

## Motor Test — MAV_CMD_DO_MOTOR_TEST (209)

Tests individual motors or all motors simultaneously.

### ArduPilot Parameters
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
- Vehicle MUST be disarmed
- Remove propellers before testing
- Use low throttle values (5-10%)
- Short durations (1-2s)

## Servo Test — MAV_CMD_DO_SET_SERVO (183)

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

All calibrations use command 241 with different parameter combinations.

### Calibration Types

| Type | param1 | param2 | param3 | param5 | Duration |
|------|--------|--------|--------|--------|----------|
| Gyroscope | 1 | 0 | 0 | 0 | ~5s |
| Compass | 0 | 1 | 0 | 0 | ~30s |
| Barometer | 0 | 0 | 1 | 0 | ~5s |
| Accelerometer (6-pos) | 0 | 0 | 0 | 1 | ~60s |
| Level Horizon | 0 | 0 | 0 | 2 | ~5s |
| Simple Accel/Continue | 0 | 0 | 0 | 4 | — |
| Cancel (all zeros) | 0 | 0 | 0 | 0 | — |

### Calibration Flow

1. **Send command** with appropriate params
2. **COMMAND_ACK** returns:
   - 0 = Accepted (started)
   - 1 = Temporarily rejected
   - 2 = Denied
   - 3 = Unsupported
   - 4 = Failed
   - 5 = In progress
   - 6 = Cancelled
3. **STATUSTEXT** messages provide instructions/progress
4. For accel: autopilot sends position prompts, app sends `param5=4` to continue

### Accelerometer 6-Position Sequence

ArduPilot prompts via STATUSTEXT for each position:
1. **Level** — flat on surface
2. **Left Side** — roll left (left wing down)
3. **Right Side** — roll right (right wing down)
4. **Nose Down** — pitch forward
5. **Nose Up** — pitch backward
6. **On Back** — flip upside down

After placing the vehicle, send `param5=4` (simple accel / next step) to signal readiness. The autopilot samples, then prompts the next position.

### Compass Calibration

- Rotate vehicle slowly around all 3 axes
- Progress tracked via `MAG_CAL_PROGRESS` message (msg ID 191): `completion_pct` 0-100
- Completion via `MAG_CAL_REPORT` (msg ID 192): `cal_status` 4=SUCCESS, 5=FAILED
- Alternative: `MAV_CMD_DO_START_MAG_CAL` (42424) for advanced control

### Implementation Notes

- Always check vehicle is **disarmed** before calibrating
- Cancel any active calibration by sending all-zero params
- STATUSTEXT messages are the primary feedback channel — monitor severity 4 (WARN) and 6 (INFO)
- Gyro, baro, and level are quick (~5s) and require no user interaction beyond keeping still
- Accel requires physical repositioning and explicit continue signals
- Compass requires continuous rotation — no continue signal needed
