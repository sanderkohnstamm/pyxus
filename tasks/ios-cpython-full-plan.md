# Full Plan: Embedding CPython in Pyxus iOS App

## Overview

Replace the current development-mode polling stub in `PythonRunner.swift` with real CPython embedding using BeeWare's python-apple-support. The Python backend (FastAPI + uvicorn) will run on-device, serving the React frontend to the WKWebView over localhost.

## Phase 0: Prerequisite — Xcode Project Setup for Python.framework

**What to do:** Download and integrate the pre-built Python.framework from BeeWare's python-apple-support releases.

1. **Download python-apple-support artifact** from `https://github.com/beeware/Python-Apple-support/releases` — get the iOS arm64 build for Python 3.12 (or latest 3.x). The artifact is a tarball containing `Python.xcframework` (universal for device + simulator).

2. **Add Python.xcframework to the Xcode project:**
   - Place it at `ios/pyxios/Frameworks/Python.xcframework`
   - In Xcode: Target > General > Frameworks, Libraries, and Embedded Content > add `Python.xcframework`, set "Embed & Sign"
   - This gives you `libpython3.12.dylib` (or static `.a`) plus the standard library as compiled `.pyc` files

3. **Create a C bridging header** at `ios/pyxios/pyxios/Python/python-bridge.h`:
   ```c
   #include "Python.h"
   ```
   Set this as the Objective-C Bridging Header in Build Settings. This exposes `Py_Initialize`, `PyRun_SimpleString`, `PySys_SetPath`, etc. to Swift.

4. **Configure Header Search Paths** in Build Settings:
   - Add `$(PROJECT_DIR)/Frameworks/Python.xcframework/ios-arm64/Headers` (and the simulator variant for debug builds)

5. **Add Library Search Paths** if using static linking (the xcframework embed should handle this automatically for dynamic linking).

## Phase 1: Bundle Python Dependencies (site-packages)

The key insight: `uvicorn[standard]` pulls in `uvloop` and `httptools` which are C extensions that won't compile for iOS. Use `uvicorn` without `[standard]` — it falls back to `asyncio` + `h11`, both pure Python.

**Dependencies to bundle (all pure Python):**

| Package | Pure Python? | Notes |
|---------|-------------|-------|
| fastapi | Yes | |
| uvicorn (no [standard]) | Yes | Uses asyncio loop + h11 |
| h11 | Yes | HTTP/1.1 parser, uvicorn dep |
| starlette | Yes | FastAPI dep |
| anyio | Yes | Starlette dep |
| sniffio | Yes | anyio dep |
| idna | Yes | anyio dep |
| pydantic | Mostly | pydantic-core is Rust/C — need pre-built wheel or use `pydantic.v1` |
| pymavlink | Yes (in pure mode) | Set `MAVLINK20=1` env before import, skip C speedups |
| websockets | Yes | |
| typing_extensions | Yes | |

**Pydantic-core problem:** `pydantic` v2 depends on `pydantic-core` which is a compiled Rust extension. Options:
- **Option A (recommended):** Pre-compile `pydantic-core` for iOS arm64 using cross-compilation with `maturin` targeting `aarch64-apple-ios`. Non-trivial but doable.
- **Option B (simpler, short-term):** Pin to `pydantic<2` (v1 is pure Python). The codebase already uses pydantic v2 (`pydantic==2.10.4`), so this would require adjusting ~5 BaseModel classes.
- **Option C (not viable):** Use pydantic v2 pure-Python fallback. As of pydantic 2.x, if `pydantic-core` import fails, it does NOT gracefully fall back.

**Recommendation:** Start with Option B (pin pydantic v1, ship faster). Upgrade to Option A later.

**Steps:**

1. Create a pip download script that fetches pure-Python wheels into `ios/pyxios/Resources/site-packages/`
2. For pydantic-core, cross-compile separately or use pre-built iOS wheel. Place in same `site-packages/`.
3. Add `site-packages/` as a folder reference in Xcode under Copy Bundle Resources.
4. Add `backend/` source files as a folder reference in Xcode Copy Bundle Resources.
5. Add `frontend/dist/` as a folder reference in Copy Bundle Resources (the built React app).

## Phase 2: Rewrite PythonRunner.swift + Remove Weather + Backend Path Fixes

### Part A: Remove weather.py

Delete `backend/weather.py` and all references:
- **`backend/main.py`** — Remove weather imports, `RouteWeatherRequest` model, all `/api/weather/*` endpoints
- **`backend/requirements.txt`** — Remove `httpx` (only used by weather)
- **`frontend/src/store/droneStore.js`** — Remove `weather` state and all weather actions
- **`frontend/src/hooks/useWeather.js`** — Delete file
- **`frontend/src/components/WeatherPanel.jsx`** — Delete file
- **`frontend/src/components/WeatherMapLayer.jsx`** — Delete file
- **`frontend/src/map/WeatherLayer.jsx`** — Delete file
- **`frontend/src/map/MapView.jsx`** — Remove WeatherLayer import/usage
- **`frontend/src/components/Map.jsx`** — Remove WeatherMapLayer import/usage

### Part B: Embed CPython on-device

**Architecture:** Python.xcframework (from BeeWare python-apple-support) bundled in app. PythonRunner.swift calls Py_Initialize() on a background thread, runs bootstrap.py which starts uvicorn on localhost:8000. WKWebView connects once /api/health responds.

**Files to create:**
- `ios/pyxios/pyxios/Python/python-bridge.h` — C bridging header
- `ios/scripts/bundle-python-deps.sh` — Script to pip-install pure-Python deps, copy backend/*.py, copy frontend/dist

**PythonRunner.swift changes:**
1. Set PYTHONHOME (Python.framework in bundle), PYTHONPATH (backend + site-packages), PYTHONDONTWRITEBYTECODE=1, PYXUS_DATA_DIR (Documents dir)
2. Call Py_Initialize() on background DispatchQueue
3. Run bootstrap.py via PyRun_SimpleString (blocks on that thread — uvicorn event loop)
4. Poll /api/health from async context until ready

**bootstrap.py changes:** Simplify to use PYXUS_DATA_DIR for chdir, just import uvicorn and run.

**backend/main.py path fixes:**
- `SETTINGS_PATH`: use `PYXUS_DATA_DIR` if set (Documents dir, writable), else `__file__` dir
- `frontend_dist`: use `PYXUS_FRONTEND_DIR` if set, else relative path

### Xcode project changes (manual, via Xcode UI):
- Add Python.xcframework to Frameworks (Embed & Sign)
- Set bridging header in Build Settings
- Add Resources/site-packages, Resources/backend, Resources/frontend-dist as Copy Bundle Resources
- ENABLE_BITCODE = NO

## Phase 3: Fix Backend File System Paths for iOS

**Problem 1: `SETTINGS_PATH` in `main.py`** — App bundle is read-only on iOS. Settings must go to Documents directory.

**Fix:**
```python
_data_dir = os.environ.get("PYXUS_DATA_DIR", os.path.dirname(__file__))
SETTINGS_PATH = os.path.join(_data_dir, "settings.json")
```

**Problem 2: `frontend_dist` path in `main.py`** — On iOS, the frontend dist is bundled as a resource.

**Fix:**
```python
frontend_dist = os.environ.get(
    "PYXUS_FRONTEND_DIR",
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
)
```

## Phase 4: Update bootstrap.py for Bundle Paths

Simplify to work with both desktop and iOS:
```python
def main():
    import os
    data_dir = os.environ.get("PYXUS_DATA_DIR")
    if data_dir:
        os.chdir(data_dir)
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000,
                log_level="info", workers=1, reload=False)
```

## Phase 5: Bridging Header and Build Configuration

**New file:** `ios/pyxios/pyxios/Python/python-bridge.h`

**Xcode Build Settings:**
- `SWIFT_OBJC_BRIDGING_HEADER` = `pyxios/Python/python-bridge.h`
- `HEADER_SEARCH_PATHS` += path to Python headers in xcframework
- `OTHER_LDFLAGS` += `-lpython3.12` (if static linking)
- `ENABLE_BITCODE` = `NO`

## Phase 6: Build Script for Dependency Packaging

Create `ios/scripts/bundle-python-deps.sh`:
1. Creates clean `ios/pyxios/Resources/site-packages/`
2. Pip-installs pure-Python packages with `--target`
3. Strips `__pycache__` dirs
4. Copies backend `.py` files into `ios/pyxios/Resources/backend/`
5. Builds React frontend and copies `dist/` into `ios/pyxios/Resources/frontend-dist/`

## Incremental Implementation Order

1. **Step 1** (testable independently): Fix `main.py` path handling with env var overrides. Zero behavior change on desktop.
2. **Step 2** (testable independently): Download and add Python.xcframework. Create bridging header. Verify compilation.
3. **Step 3** (testable independently): Bundle site-packages and backend source. Write packaging script.
4. **Step 4** (depends on 1-3): Rewrite PythonRunner.swift. Update bootstrap.py. Test on simulator.
5. **Step 5** (depends on 4): Test on physical device.
6. **Step 6**: Handle pydantic-core cross-compilation (or ship with pydantic v1 workaround).

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| pydantic-core (Rust C ext) won't compile for iOS | High | Fall back to pydantic v1 temporarily |
| Python.framework size bloats app (~50MB) | Medium | Acceptable for utility app; strip unused stdlib |
| uvicorn startup slow on device | Low | Async polling handles this; show progress in LaunchView |
| pymavlink C speedups unavailable | Low | Pure Python mode works fine for single drone |
| iOS kills background Python thread | Medium | BackgroundManager.swift handles with `beginBackgroundTask` |
| `PyRun_SimpleFile` not available in Swift | Low | Use `PyRun_SimpleString("exec(open('bootstrap.py').read())")` |

## Files Summary

**New files to create:**
- `ios/pyxios/pyxios/Python/python-bridge.h`
- `ios/pyxios/Frameworks/Python.xcframework/` (downloaded)
- `ios/pyxios/Resources/site-packages/`
- `ios/pyxios/Resources/backend/`
- `ios/pyxios/Resources/frontend-dist/`
- `ios/scripts/bundle-python-deps.sh`

**Files to modify:**
- `ios/pyxios/pyxios/Python/PythonRunner.swift`
- `ios/pyxios/pyxios/Python/bootstrap.py`
- `backend/main.py` (2 env var overrides)
- `ios/pyxios/pyxios.xcodeproj/project.pbxproj` (via Xcode UI)

**Files that need no changes:**
- `backend/drone.py`, `backend/mission.py`, `backend/vehicle_profiles.py`
- `ios/pyxios/pyxios/ContentView.swift`, `WebViewContainer.swift`, `BackgroundManager.swift`
