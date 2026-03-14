# Pyxus

## Mission

**Enhancing mission success.**

Pyxus is a ground control station that gives pilots full control of their drones — the right buttons, at the right time, with the information they need to complete their missions.

### Core Principles

- **Pilot in control** — the interface surfaces what the pilot needs, when they need it. No clutter, no guesswork.
- **Mission success** — every feature exists to help pilots complete what they set out to do, reliably
- **Operator awareness** — clear telemetry, status, and alerts so the pilot always knows the state of their vehicle

## Priorities

1. **Pilot Control** — right controls at the right time, minimal friction
2. **Mission Success** — features that help complete missions reliably
3. **Operator Awareness** — clear telemetry, alerts, status
4. **Core Operations** — mission planning, vehicle control, parameters
5. **Quality of Life** — UI polish, field usability, settings

## Roadmap

### Now — Pilot Control & Mission Reliability

| # | Issue | Labels |
|---|-------|--------|
| 3 | Connection loss detection with clear status and reconnect | reliability, high |
| 4 | Command confirmation for destructive actions | ux, high |
| 8 | Emergency stop with prominent UI placement | ux, high |
| 9 | Robust auto-reconnect with exponential backoff | reliability, high |
| 10 | Telemetry alerts and threshold warnings system | awareness, high |
| 5 | Pre-upload mission validation | mission, high |

### Next — Awareness & Field Readiness

| # | Issue | Labels |
|---|-------|--------|
| 6 | Flight data logging and post-flight replay | high |
| 22 | Parameter validation and range checking before SET | medium |
| 28 | Structured pre-arm readiness dashboard | medium |
| 12 | No-fly zone / airspace restriction overlay | medium |

### Later — Core Ops & Quality of Life

| # | Issue | Labels |
|---|-------|--------|
| 7 | Offline map tile caching for field operations | reliability, medium |
| 11 | Multi-vehicle fleet overview dashboard | medium |
| 13 | Quick action bar with keyboard-first workflow | ux, medium |
| 15 | Waypoint altitude profile visualization | ux, medium |
| 16 | Vehicle type auto-detection and capability gating | medium |
| 17 | Automated test suite for MAVLink protocol handlers | reliability, medium |
| 19 | Military-grade wireframe theme | ux, medium |
| 14 | MAVLink message rate configuration per stream | low |

## Architecture

- **Backend**: FastAPI + pymavlink (Python) — `/backend/`
- **Frontend**: React + Vite + Tailwind + Zustand + Leaflet — `/frontend/`
- **iOS**: Native SwiftUI + pure Swift MAVLink v2 — `/ios/`
- **Electron**: Desktop wrapper — `/electron/`
- **Protocol**: MAVLink v2 — reference https://mavlink.io
- **Docs**: Architecture, protocol guide, codebase review — `/docs/`

## Current State

Core GCS implemented: real-time telemetry, mission planning/upload/download, geofencing (circle + polygon), gamepad/keyboard control, parameter management, video streaming, pre-flight checklists, dark/light theme. iOS app with native MAVLink v2 stack (no MAVSDK dependency).

iOS FlyView: follow-mode (auto-centers on drone, disables on manual pan), mission waypoint overlay on map, mission download from drone, auto-download on connect, landscape-optimized bottom-right button layout. iOS PlanView: live drone position marker, geofence planning (tap to place center, radius slider 50-2000m), mission download from drone. Geofence data persisted with saved missions.

**Connection loss detection**: iOS shows a red banner with elapsed time when link is lost. Desktop shows per-drone link-lost banners with reconnect buttons.

**Telemetry alerts**: iOS TelemetryAlertService monitors battery voltage and altitude against autopilot params (BATT_LOW_VOLT, BATT_CRT_VOLT, FENCE_ALT_MAX) with hysteresis and haptic feedback. Alert capsules overlay below HUD. Desktop BatteryMonitor includes altitude fence warnings.

**Offline map tiles**: Desktop uses a service worker (cache-first) for Esri satellite tiles with a ToolsPanel UI for caching visible area, progress display, stats, and cache clearing. iOS uses CachedTileOverlay (MKTileOverlay subclass) with 30-day disk cache for satellite tiles.

**Key gaps**: No flight logging. Emergency stop could be more prominent.
