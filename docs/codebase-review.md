# Codebase Review

Thorough review of the Pyxus codebase as of March 2026. Covers structure, code quality, and issues across all three platforms.

## Codebase Stats

| Component | Files | Lines | Purpose |
|-----------|-------|-------|---------|
| Backend (Python) | 5 | ~3,300 | FastAPI server, MAVLink handler, missions |
| Frontend (React) | 73 | ~8,000 | Desktop + mobile UI, map, state management |
| iOS (Swift) | 32 | ~5,000+ | Native app, MAVLink protocol, services |
| Electron | 3 | ~300 | Desktop shell |
| Tests | 4 | ~600 | Backend unit tests |
| Tools | 1 | ~450 | MAVLink Swift code generator |
| **Total** | **~118** | **~17,650** | |

## Structure Assessment

### What Works Well

- **Clean separation by platform**: backend/, frontend/, ios/, electron/ are fully independent
- **Shared protocol knowledge**: Both Python and Swift stacks implement the same MAVLink patterns
- **Safety-first design**: Pre-flight checks, command confirmation, emergency stop are built in
- **Multi-drone from day one**: Backend and frontend support N drones
- **Theme system**: CSS variables make dark/light mode work without CSS-in-JS overhead
- **iOS MAVLink stack**: Pure Swift, no C dependencies, auto-generated from XML

### What Needs Improvement

- **Oversized files**: Map.jsx (1815 lines), droneStore.js (1092), drone.py (1500), DroneManager.swift (681)
- **God objects**: DroneManager.swift and drone.py handle connection + commands + telemetry + missions + params
- **Duplicated logic**: Vehicle type maps exist in both drone.py and vehicle_profiles.py
- **Missing iOS tests**: Zero automated tests for the Swift MAVLink layer
- **No error boundaries**: Frontend crash in Map or MissionPanel crashes the entire app

---

## Backend Review

### main.py (1205 lines) — Grade: B+

FastAPI app with REST + WebSocket endpoints. Well-structured route organization, smart telemetry broadcasting with delta compression.

**Issues:**
- Synchronous file I/O (`load_settings`, `save_settings`) in async endpoints — should use `asyncio.to_thread()`
- Unbounded `_terrain_cache` dict — needs LRU or size cap
- CORS hardcoded to localhost — no production configuration
- Video subprocess cleanup: `kill()` without graceful `terminate()` first

### drone.py (1500 lines) — Grade: B-

Core MAVLink handler. Complex threading model with multiple locks.

**Critical issues:**
- **Race condition on `_mav` access**: 40+ locations read `_mav` without lock. If `disconnect()` sets `_mav = None` while a command is executing, AttributeError crashes the thread.
- **Unbounded collections**: `_params` dict, mission queue, and status message queue have no size limits
- **No lock hierarchy documentation**: Multiple overlapping locks risk deadlock
- **Stale link_lost state**: No hysteresis on link loss detection — bounces between lost/recovered

**Strengths:**
- Comprehensive telemetry parsing
- Component discovery for multi-component vehicles
- Well-tested validation logic (separate test file)

### mission.py (469 lines) — Grade: B

Clean mission protocol implementation.

**Issues:**
- Fixed 30s timeout with no progress feedback
- Missing MISSION_ACK on download timeout (leaves vehicle in inconsistent state)
- Hardcoded command numbers (5001, 5003) instead of mavutil constants

### vehicle_profiles.py (91 lines) — Grade: B+

Simple and correct. Vehicle type lists duplicated in drone.py.

---

## Frontend Review

### droneStore.js (1092 lines) — Grade: B

Zustand state management. Feature-complete but monolithic.

**Issues:**
- Single store handles telemetry, missions, UI, theme, geofence, params, calibration
- Should split into domain-specific stores
- Collision-prone ID generation (`Date.now() + Math.random() * 10000`)

### Map.jsx (1815 lines) — Grade: C+

The largest component. Multi-drone rendering, waypoints, patterns, fences, tools.

**Critical**: Unmaintainable at this size. Needs decomposition into 4-5 focused components (DroneLayer, MissionLayer, ToolsLayer, WaypointEditor).

**Issues:**
- Memory leak potential from many Leaflet event listeners
- No fallback tiles if CartoDB is unavailable
- Pattern generation spawns multiple overlapping modals

### MissionPanel.jsx (1068 lines) — Grade: B-

Feature-rich mission planning UI. Second largest component.

**Issues:**
- No undo/redo for mission changes
- Heavy store access causes frequent re-renders
- Missing upload progress indicator

### useWebSocket.js (188 lines) — Grade: A-

Excellent telemetry buffering (coalesce per animation frame). Clean reconnection.

**Issues:**
- Fixed 2s reconnect delay (should be exponential backoff)
- Calibration keyword matching uses simple string comparison (false positive risk)

### commandSafety.js (38 lines) — Grade: B

Safety gates for dangerous commands.

**Issues:**
- Airborne threshold too low (1m — should be 3-5m)
- Missing checks for mission upload while armed, rapid disarm/rearm

---

## iOS Review

### DroneManager.swift (681 lines) — Grade: C+

God object handling connection, commands, missions, params, telemetry, manual control.

**Critical issues:**
- Mission upload uses `Thread.sleep()` and tight loop on background thread
- Manual control timer reads shared properties without synchronization
- Callback nesting (connection state, telemetry, status, param, command ACK)

**Needs**: Split into ConnectionManager, CommandService, TelemetryService, MissionService.

### MAVLinkDrone.swift (724 lines) — Grade: B

High-level MAVLink API. Good ArduPilot/PX4 abstraction.

**Issues:**
- `handleFrame()` is a 155-line switch statement
- Mission queue race between frame handler and upload code
- Callbacks fire on background thread, dispatched to main async — timing-dependent

### MAVLinkConnection.swift (194 lines) — Grade: A

Clean NWConnection UDP wrapper. Thread-safe, proper cleanup.

### MAVLinkFrame.swift (~300 lines) — Grade: A

Solid streaming parser with CRC validation.

### Views — Grade: B+ average

Generally well-structured SwiftUI. FlyView and PlanView are getting large. WaypointEditor needs input validation. CalibrationView and MotorTestView are stubs.

---

## Cross-Cutting Concerns

### Testing

| Area | Coverage | Grade |
|------|----------|-------|
| Backend validation (RC, params, video URL) | Good | A |
| Backend vehicle profiles | Good | A |
| Backend mission protocol | None | F |
| Backend drone.py core logic | None | F |
| Frontend utils (geo, formatCoord) | Basic | C |
| Frontend components | None | F |
| iOS MAVLink parsing | None | F |
| iOS DroneManager | None | F |

### Error Handling

- Backend: Too-broad exception catching in drone.py command execution
- Frontend: No React error boundaries. No request timeouts in api.js.
- iOS: Silent `try?` in FlightPlan save/load. No validation in WaypointEditor.

### Thread Safety

- Backend: `_mav` access unprotected, multiple locks without ordering
- Frontend: Single-threaded (JS), no issues
- iOS: Manual control reads race with joystick updates, mission queue race

### Security

- Backend: CORS hardcoded to localhost (fine for now, problematic at scale)
- Backend: Video proxy URL validated against SSRF (good, shipped in PR #20)
- No authentication on any endpoint (acceptable for local GCS, not for remote)
