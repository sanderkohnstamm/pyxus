# Pyxus

## Mission

**Safe drone flight and mission success.**

Pyxus is a ground control station that ensures drones complete their missions safely. When autonomous systems degrade, Pyxus fails gracefully — never silently — and keeps operators fully informed.

### Core Principles

- **Graceful degradation** — when GPS drops, comms fail, or sensors drift, the system degrades safely, not catastrophically
- **Operator awareness** — every autonomous system failure is surfaced clearly to the operator. No silent failures.
- **Mission success** — help operators complete what they set out to do, reliably

## Priorities

1. **Graceful Degradation** — systems fail safely, never silently or catastrophically
2. **Operator Awareness** — warnings, alerts, status when autonomous systems degrade
3. **Mission Success** — features that help complete missions reliably
4. **Core Operations** — mission planning, telemetry, vehicle control
5. **Quality of Life** — UI polish, field usability, settings

## Roadmap

### Now — Safety Foundation

High-priority issues that make flight fundamentally safer.

| # | Issue | Labels |
|---|-------|--------|
| 3 | Connection loss failsafe: auto-detect disconnect and trigger RTL | safety, high |
| 4 | Dangerous command confirmation dialog | safety, high |
| 5 | Pre-upload mission validation with safety checks | safety, high |
| 8 | Emergency stop / kill switch with prominent UI placement | safety, high |
| 9 | Robust auto-reconnect with exponential backoff | reliability, high |
| 10 | Telemetry alerts and threshold warnings system | safety, high |
| 27 | Predictive RTL safety envelope with live map overlay | safety, high, experimental |

### Next — Operator Awareness & Mission Reliability

| # | Issue | Labels |
|---|-------|--------|
| 6 | Flight data logging and post-flight replay | high |
| 22 | Parameter validation and range checking before SET | safety, medium |
| 23 | RC input validation and PWM bounds checking | safety, medium |
| 28 | Structured pre-arm readiness dashboard | safety, medium, experimental |
| 12 | No-fly zone / airspace restriction overlay | safety, medium |

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

## Open PRs

| # | Title | Status |
|---|-------|--------|
| 2 | Multi-drone control support | Needs fixes (dict mutation bug, deadlock risk) |
| 18 | Home position tracking, WS buffering, map refactor | Needs fixes (stale closure, gamepad defaults) |

## Recently Shipped

- **#21** — Fix bare exception handling (structured logging, specific exception types)
- **#20** — Sanitize video proxy URL (SSRF protection, shell injection prevention)

## Architecture

- **Backend**: FastAPI + pymavlink (Python) — `/backend/`
- **Frontend**: React + Vite + Tailwind + Zustand + Leaflet — `/frontend/`
- **Electron**: Desktop wrapper — `/electron/`
- **Protocol**: MAVLink via pymavlink — reference https://mavlink.io

## Current State

Core GCS implemented: real-time telemetry, mission planning/upload/download, geofencing (circle + polygon), gamepad/keyboard control, parameter management, video streaming, pre-flight checklists, dark/light theme.

**Key gaps**: No graceful degradation handling. No operator alerts for system failures. No flight logging. Emergency stop not prominent enough. Connection loss not handled gracefully.
