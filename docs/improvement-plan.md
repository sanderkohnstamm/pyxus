# Improvement Plan

Prioritized improvements for the Pyxus codebase, organized by urgency and impact. Follows the project's priority order: Pilot Control > Mission Success > Operator Awareness > Core Ops > Quality of Life.

---

## Phase 1: Pilot Control & Correctness (Critical)

### ~~1.1 Fix takeoff flow~~
**Status**: Done
**What**: ArduPilot requires GUIDED mode before takeoff. Added `setMode("GUIDED")` before `MAV_CMD_NAV_TAKEOFF`.

### ~~1.2 Fix mode switching~~
**Status**: Done
**What**: Mode names were case-sensitive ("Guided" vs "GUIDED"). Added `.uppercased()` in `setMode()`. Also exposed all available modes from the autopilot mode map instead of a hardcoded 5-mode list.

### ~~1.3 Add inspector message detail~~
**Status**: Done
**What**: Tapping a stream in MAV Inspector now shows a detail sheet with hex dump, decoded fields, and stats.

### ~~1.4 Fix `_mav` race condition in drone.py~~
**Status**: Done
**What**: Added `_mav_lock` to protect `force_disarm()`, `connect()`, `disconnect()`, and `_run_loop()`. Uses snapshot pattern (short critical sections) to avoid blocking the connection thread.

### ~~1.5 Fix iOS mission queue threading~~
**Status**: Done
**What**: Replaced `Thread.sleep(0.3)` with proper drain-and-wait pattern. Added `isMissionDownloading` state. Added mutual exclusion between upload and download operations.

### ~~1.6 Add React error boundaries~~
**Status**: Done
**What**: Created `ErrorBoundary.jsx` component. Wrapped MapView, FlyOverlay, and sidebar panel in App.jsx. Shows styled fallback with reload button on crash.

### ~~1.7 Add request timeouts to api.js~~
**Status**: Done
**What**: Added `fetchWithTimeout()` utility with AbortController (10s default, 5s for emergency stop). Converted 21 bare fetch calls across 7 files.

---

## Phase 2: Architecture & Maintainability (High)

### ~~2.1 Split DroneManager.swift (iOS)~~
**Status**: Done
**What**: Extracted from the 873-line god object into:
- `MissionService.swift` (322 lines) — upload/download protocol, mission control
- `ParameterService.swift` (86 lines) — fetch/set params
- `TelemetryService.swift` (125 lines) — state updates, stream rates

DroneManager slimmed to 471 lines as thin coordinator with convenience forwarding methods.

### ~~2.2 Split Map.jsx (Frontend)~~
**Status**: Done
**What**: Split 1,815-line component into 7 focused files:
- `Map.jsx` (376 lines) — orchestrator
- `map/mapIcons.js` (179 lines) — icon factories, constants
- `map/MapBehaviors.jsx` (154 lines) — GcsLocator, DroneFollower, click handling
- `map/MissionOverlays.jsx` (246 lines) — context menu, manipulation, jump arrows
- `map/PlannedMissionLayer.jsx` (216 lines) — waypoint/fence markers
- `map/DroneMissionLayer.jsx` (217 lines) — active mission display
- `map/InteractiveTools.jsx` (470 lines) — servo, measure, fly click, quick mission

### ~~2.3 Split droneStore.js (Frontend)~~
**Status**: Done
**What**: Split 1,093-line store into 9 domain slices + 396-line main file:
- `slices/missionSlice.js` (266 lines), `slices/uiSlice.js` (130 lines), `slices/inputSlice.js` (93 lines), `slices/patternSlice.js` (71 lines), `slices/flyModeSlice.js` (64 lines), `slices/fenceSlice.js` (43 lines), `slices/batterySlice.js` (42 lines), `slices/calibrationSlice.js` (28 lines), `slices/videoSlice.js` (11 lines)

Zero API changes — all consumer imports remain identical.

### ~~2.4 Deduplicate vehicle type maps~~
**Status**: Done
**What**: Moved `MAV_TYPE_NAMES`, `VEHICLE_TYPES`, `PERIPHERAL_TYPES` to `vehicle_profiles.py` as single source of truth. Removed duplicates from `drone.py`, updated all references.

---

## Phase 3: Testing (High)

### ~~3.1 MAVLink protocol tests (Backend)~~
**Status**: Done
**What**: Created `tests/test_mission.py` with 43 tests covering upload (normal, retry, timeout, rejected), download (ArduPilot/PX4, empty, timeout), fence (circle/polygon upload/download), and mission control (start/pause/clear). Uses `MockDroneConnection` for protocol simulation.

### 3.2 MAVLink frame tests (iOS)
**Status**: Deferred — requires XCTest target creation in Xcode
**What**: XCTest suite for frame parsing, CRC validation, encode/decode roundtrip, zero-trimming.

### ~~3.3 drone.py core logic tests~~
**Status**: Done
**What**: Created `tests/test_drone.py` with 49 tests covering ArduPilot/PX4 mode decoding (all vehicle types + fallback), TelemetryState defaults and serialization, `sanitize_for_json` (NaN/Inf/nested), and link loss detection.

### ~~3.4 Frontend component tests~~
**Status**: Done
**What**: Added `"test"` script to package.json. Created `api.test.js` (4 tests for fetchWithTimeout) and `droneStore.test.js` (16 tests for waypoints, theme, drone registration). 20/20 new tests passing.

---

## Phase 4: Robustness (Medium)

### ~~4.1 Exponential backoff for WebSocket reconnect~~
**Status**: Done
**What**: Replaced fixed 2s delay with exponential backoff (2s → 4s → 8s → ... → 30s cap) with random jitter (0-1s). Resets to 2s on successful connection.

### ~~4.2 Bound all unbounded collections~~
**Status**: Done
**What**: `_statustext_queue` → `deque(maxlen=100)`. `_mission_msg_queue` → `Queue(maxsize=100)` with non-blocking put. `_params` → warning at 5000+ entries. `_terrain_cache` → LRU eviction at 10,000 entries.

### ~~4.3 Mission upload progress reporting~~
**Status**: Done
**What**: iOS MissionService now reports per-item progress ("Uploading item 3/10") via statusCallback during the upload loop.

### ~~4.4 Link loss hysteresis~~
**Status**: Done
**What**: Added `HEARTBEAT_MISS_THRESHOLD = 2` and `_missed_heartbeats` counter. Link declared lost only after 2 consecutive missed heartbeats. Single misses log at debug level only.

### ~~4.5 Graceful video subprocess cleanup~~
**Status**: Done
**What**: Changed to `process.terminate()` first, waits 3s with `asyncio.wait_for`, falls back to `process.kill()` on timeout.

---

## Phase 5: Features (from PROJECT.md roadmap)

### 5.1 Connection loss detection (Issue #3)
**What**: Clear status indication when connection drops, with easy reconnect.

### 5.2 Telemetry alerts system (Issue #10)
**What**: Configurable thresholds (battery %, altitude, GPS sats). Warning bar when violated.

### 5.3 Flight data logging (Issue #6)
**What**: Record telemetry + commands to file. Post-flight replay.

### 5.4 Offline map tiles (Issue #7)
**What**: Cache map tiles for field operations without internet.

---

## Phase 6: Code Quality (Ongoing)

### ~~6.1 Async file I/O in FastAPI~~
**Status**: Done
**What**: Wrapped `load_settings()` and `save_settings()` with `asyncio.to_thread()` in async endpoints.

### ~~6.2 iOS input validation~~
**Status**: Done
**What**: Added `clampValues()` to WaypointEditor — bounds altitude (0-500m), speed (0-50m/s), loiterRadius (0.1-1000m), loiterTime (0-3600s), acceptRadius (0.1-1000m), wraps yawAngle to 0-360.

### ~~6.3 Consistent error handling in drone.py~~
**Status**: Done
**What**: Added `logger.warning()` to PX4 param metadata fetch exception handler. Existing error handling in drone.py was already specific (no broad `except:` found).

---

## Priority Matrix

| Phase | Impact | Effort | Status |
|-------|--------|--------|--------|
| 1. Pilot Control & Correctness | Critical | Small | **Done** |
| 2. Architecture | High | Medium | **Done** |
| 3. Testing | High | Medium | **Done** (3.2 deferred) |
| 4. Robustness | Medium | Small | **Done** |
| 5. Features | High | Large | Per roadmap |
| 6. Code Quality | Low-Medium | Small | **Done** |

## Definition of Done

Each improvement is complete when:
1. Code is written and compiles
2. Tests pass (existing + new if applicable)
3. Manual verification against SITL
4. Code reviewed (self-review minimum)
5. Committed with descriptive message
