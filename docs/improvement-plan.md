# Improvement Plan

Prioritized improvements for the Pyxus codebase, organized by urgency and impact. Follows the project's priority order: Pilot Control > Mission Success > Operator Awareness > Core Ops > Quality of Life.

---

## Phase 1: Safety & Correctness (Critical)

These fix bugs and race conditions that could cause issues during flight.

### 1.1 Fix `_mav` race condition in drone.py
**Impact**: Prevents crashes during disconnect/reconnect
**Effort**: Small
**What**: Protect all `_mav` access with a dedicated `_mav_lock`. Currently 40+ unprotected reads/writes across threads.
```python
# Before (crashes if disconnect() runs concurrently)
if not self._mav: return
self._mav.mav.command_long_send(...)

# After
with self._mav_lock:
    if not self._mav: return
    self._mav.mav.command_long_send(...)
```

### 1.2 Fix iOS mission queue threading
**Impact**: Prevents stale/corrupt mission uploads
**Effort**: Small
**What**: Replace `Thread.sleep()` polling in DroneManager with proper async/await or OperationQueue. Add mutual exclusion between frame handler mission routing and upload code.

### 1.3 Add React error boundaries
**Impact**: Prevents full app crash from component errors
**Effort**: Small
**What**: Wrap Map, MissionPanel, and FlyOverlay in error boundaries. Show "Something went wrong" fallback instead of white screen.

### 1.4 Add request timeouts to api.js
**Impact**: Prevents hanging UI on network partition
**Effort**: Tiny
**What**: Add `AbortController` with 10s timeout to all fetch calls. Currently requests hang indefinitely.

### 1.5 Fix commandSafety thresholds
**Impact**: Prevents accidental disarm close to ground
**Effort**: Tiny
**What**: Increase airborne threshold from 1m to 3m. Add checks for mission upload while armed.

---

## Phase 2: Architecture & Maintainability (High)

Structural improvements that make the codebase sustainable.

### 2.1 Split DroneManager.swift (iOS)
**Impact**: Maintainability, testability
**Effort**: Medium
**What**: Extract from the 681-line god object:
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
**What**: `drone.py` and `vehicle_profiles.py` both define copter/plane/rover type lists. Make `vehicle_profiles.py` the single source of truth. Same for ArduPilot mode tables duplicated between Python and Swift.

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
- Edge case: 0 items, 1 item, max items

### 3.2 MAVLink frame tests (iOS)
**Impact**: Validate generated code correctness
**Effort**: Medium
**What**: XCTest suite for:
- Frame parsing (valid v2 frames, v1 rejection, CRC failure)
- Message encode/decode roundtrip for key messages (HEARTBEAT, COMMAND_LONG, MISSION_ITEM_INT)
- CRC extra validation against known values
- Zero-trimming correctness

### 3.3 drone.py core logic tests
**Impact**: Catch telemetry parsing and mode decode bugs
**Effort**: Medium
**What**: Test:
- ArduPilot mode decoding (all vehicle types)
- PX4 mode decoding
- Telemetry state updates from mock messages
- Link loss detection timing
- Component discovery

### 3.4 Frontend component tests
**Impact**: Catch UI regressions
**Effort**: Medium
**What**: React Testing Library tests for:
- ConnectionBar connection flow
- MissionPanel waypoint CRUD
- FlyOverlay command safety gates
- commandSafety.js edge cases

---

## Phase 4: Robustness (Medium)

### 4.1 Exponential backoff for WebSocket reconnect
**Impact**: Better behavior on flaky networks
**Effort**: Tiny
**What**: Replace fixed 2s reconnect with exponential backoff (2s → 4s → 8s → 16s → 30s max). Reset on successful connection.

### 4.2 Bound all unbounded collections
**Impact**: Prevents memory leaks on long sessions
**Effort**: Small
**What**:
- `drone.py`: Cap `_params` dict, mission queue (`maxsize=100`), status message queue
- `main.py`: LRU cache for `_terrain_cache`
- `DroneManager.swift`: Already capped at 200 status messages (good)

### 4.3 Mission upload progress reporting
**Impact**: Operator awareness during uploads
**Effort**: Small
**What**: Both backend and iOS should report per-item progress. Backend already has WebSocket `/ws/mission` — wire up real progress. iOS should update a published progress property.

### 4.4 Link loss hysteresis
**Impact**: Prevents flapping between connected/disconnected
**Effort**: Small
**What**: Require N consecutive missed heartbeats before declaring link lost. Require N consecutive heartbeats before declaring recovery. Prevents UI thrashing on marginal connections.

### 4.5 Graceful video subprocess cleanup
**Impact**: Prevents zombie ffmpeg processes
**Effort**: Tiny
**What**: In `main.py`, use `terminate()` with 5s timeout before `kill()`. Currently calls `kill()` immediately.

---

## Phase 5: Features (from PROJECT.md roadmap)

### 5.1 Connection loss failsafe (Issue #3)
**What**: Auto-detect disconnect, show prominent warning, optionally trigger RTL. This is the #1 safety gap.

### 5.2 Telemetry alerts system (Issue #10)
**What**: Configurable thresholds (battery %, altitude, GPS sats, RSSI). Persistent warning bar when violated. Audio alerts.

### 5.3 Flight data logging (Issue #6)
**What**: Record all telemetry + commands to file. Post-flight replay viewer. Essential for incident investigation.

### 5.4 Parameter validation (Issue #22)
**What**: Range checking before PARAM_SET. Warn on dangerous params (e.g., disabling failsafes). Type validation for ArduPilot's C-cast encoding.

### 5.5 Offline map tiles (Issue #7)
**What**: Cache map tiles for field operations without internet. Service worker for frontend, file cache for iOS.

---

## Phase 6: Code Quality (Ongoing)

### 6.1 Async file I/O in FastAPI
**What**: Replace synchronous `open()`/`json.load()` in async endpoints with `asyncio.to_thread()`.

### 6.2 iOS input validation
**What**: Add bounds checking to WaypointEditor (altitude > 0, speed > 0, radius > 0). Add Float validation to ParamsView.

### 6.3 Replace C API in ConnectView
**What**: Use Network.framework's `NWPathMonitor` instead of `getifaddrs()` for WiFi address lookup.

### 6.4 Consistent error handling in drone.py
**What**: Replace broad `except (OSError, struct.error, KeyError, ValueError)` with specific handlers. Log stack traces for unexpected errors.

### 6.5 iOS dependency injection
**What**: Pass services via environment instead of singleton access. Makes testing possible and reduces coupling.

---

## Priority Matrix

| Phase | Impact | Effort | When |
|-------|--------|--------|------|
| 1. Safety & Correctness | Critical | Small | Now |
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
