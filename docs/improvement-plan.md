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

### 1.4 Fix `_mav` race condition in drone.py
**Impact**: Prevents crashes during disconnect/reconnect
**Effort**: Small
**What**: Protect all `_mav` access with a dedicated `_mav_lock`. Currently 40+ unprotected reads/writes across threads.

### 1.5 Fix iOS mission queue threading
**Impact**: Prevents stale/corrupt mission uploads
**Effort**: Small
**What**: Replace `Thread.sleep()` polling in DroneManager with proper async/await or OperationQueue. Add mutual exclusion between frame handler mission routing and upload code.

### 1.6 Add React error boundaries
**Impact**: Prevents full app crash from component errors
**Effort**: Small
**What**: Wrap Map, MissionPanel, and FlyOverlay in error boundaries. Show "Something went wrong" fallback instead of white screen.

### 1.7 Add request timeouts to api.js
**Impact**: Prevents hanging UI on network partition
**Effort**: Tiny
**What**: Add `AbortController` with 10s timeout to all fetch calls.

---

## Phase 2: Architecture & Maintainability (High)

Structural improvements that make the codebase sustainable.

### 2.1 Split DroneManager.swift (iOS)
**Impact**: Maintainability, testability
**Effort**: Medium
**What**: Extract from the god object:
- `ConnectionService` — connect/disconnect, state management
- `CommandService` — arm, takeoff, land, mode changes
- `TelemetryService` — state updates, stream rates
- `MissionService` — upload/download protocol
- `ParameterService` — fetch/set params

DroneManager becomes a thin coordinator.

### 2.2 Split Map.jsx (Frontend)
**Impact**: Maintainability, parallel development
**Effort**: Medium
**What**: Break the 1815-line component into:
- `MapContainer.jsx` — Leaflet setup, tile layers, theme
- `DroneLayer.jsx` — Drone markers, trails, heading
- `MissionLayer.jsx` — Waypoint markers, paths, editing
- `FenceLayer.jsx` — Geofence visualization (already partially extracted)
- `MapToolsLayer.jsx` — Measure tool, pattern generation

### 2.3 Split droneStore.js (Frontend)
**Impact**: Performance (fewer re-renders), maintainability
**Effort**: Medium
**What**: Split into domain-specific Zustand stores:
- `useTelemetryStore` — per-drone telemetry, connection state
- `useMissionStore` — waypoints, saved missions, upload state
- `useUIStore` — theme, tabs, sidebar, map layers
- `useBatchStore` — multi-drone batch operations

### 2.4 Deduplicate vehicle type maps
**Impact**: Consistency, fewer bugs
**Effort**: Small
**What**: `drone.py` and `vehicle_profiles.py` both define copter/plane/rover type lists. Make `vehicle_profiles.py` the single source of truth.

---

## Phase 3: Testing (High)

### 3.1 MAVLink protocol tests (Backend)
**Impact**: Catch mission upload/download regressions
**Effort**: Medium
**What**: Test `mission.py` upload/download with mock MAVLink connection. Cover:
- Normal upload flow
- Duplicate sequence request (AP retry)
- Timeout scenarios
- Fence upload

### 3.2 MAVLink frame tests (iOS)
**Impact**: Validate generated code correctness
**Effort**: Medium
**What**: XCTest suite for:
- Frame parsing (valid v2 frames, v1 rejection, CRC failure)
- Message encode/decode roundtrip for key messages
- CRC extra validation against known values
- Zero-trimming correctness

### 3.3 drone.py core logic tests
**Impact**: Catch telemetry parsing and mode decode bugs
**Effort**: Medium
**What**: Test ArduPilot/PX4 mode decoding, telemetry state updates, link loss detection.

### 3.4 Frontend component tests
**Impact**: Catch UI regressions
**Effort**: Medium
**What**: React Testing Library tests for ConnectionBar, MissionPanel, FlyOverlay.

---

## Phase 4: Robustness (Medium)

### 4.1 Exponential backoff for WebSocket reconnect
**Effort**: Tiny
**What**: Replace fixed 2s reconnect with exponential backoff (2s → 4s → 8s → 30s max).

### 4.2 Bound all unbounded collections
**Effort**: Small
**What**: Cap `_params` dict, mission queue, terrain cache in backend. Prevent memory leaks on long sessions.

### 4.3 Mission upload progress reporting
**Effort**: Small
**What**: Report per-item upload progress to UI. iOS should update a published progress property.

### 4.4 Link loss hysteresis
**Effort**: Small
**What**: Require N consecutive missed heartbeats before declaring link lost. Prevents UI flapping.

### 4.5 Graceful video subprocess cleanup
**Effort**: Tiny
**What**: Use `terminate()` with timeout before `kill()` in main.py.

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

### 6.1 Async file I/O in FastAPI
**What**: Replace synchronous file I/O in async endpoints with `asyncio.to_thread()`.

### 6.2 iOS input validation
**What**: Bounds checking in WaypointEditor and ParamsView.

### 6.3 Consistent error handling in drone.py
**What**: Replace broad exception catching with specific handlers.

---

## Priority Matrix

| Phase | Impact | Effort | When |
|-------|--------|--------|------|
| 1. Pilot Control & Correctness | Critical | Small | Now |
| 2. Architecture | High | Medium | Next sprint |
| 3. Testing | High | Medium | Parallel with Phase 2 |
| 4. Robustness | Medium | Small | After Phase 2 |
| 5. Features | High | Large | Per roadmap |
| 6. Code Quality | Low-Medium | Small | Ongoing |

## Definition of Done

Each improvement is complete when:
1. Code is written and compiles
2. Tests pass (existing + new if applicable)
3. Manual verification against SITL
4. Code reviewed (self-review minimum)
5. Committed with descriptive message
