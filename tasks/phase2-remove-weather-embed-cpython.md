# Phase 2: Embed CPython on iOS + Remove Weather

## Part A: Remove weather.py

Delete `backend/weather.py` and all references.

### Files to modify:
- **`backend/main.py`** — Remove `from weather import ...` (line 24-25), `RouteWeatherRequest` model (line 135), all `/api/weather/*` endpoints (lines 1079-1195), remove `httpx` usage if only used by weather
- **`backend/requirements.txt`** — Remove `httpx` (only used by weather.py)
- **`frontend/src/store/droneStore.js`** — Remove `weather` state (lines 225-228) and all `setWeather*`/`toggleWeather*` actions (lines 726-759)
- **`frontend/src/hooks/useWeather.js`** — Delete file
- **`frontend/src/components/WeatherPanel.jsx`** — Delete file
- **`frontend/src/components/WeatherMapLayer.jsx`** — Delete file
- **`frontend/src/map/WeatherLayer.jsx`** — Delete file
- **`frontend/src/map/MapView.jsx`** — Remove WeatherLayer import/usage
- **`frontend/src/components/Map.jsx`** — Remove any weather references
- **`backend/weather.py`** — Delete file

## Part B: Embed CPython on-device

### Architecture
Python.xcframework (from BeeWare python-apple-support) bundled in app. PythonRunner.swift calls Py_Initialize() on a background thread, runs bootstrap.py which starts uvicorn on localhost:8000. WKWebView connects once /api/health responds.

### Files to create:
- **`ios/pyxios/pyxios/Python/python-bridge.h`** — C bridging header: `#include <Python/Python.h>`
- **`ios/scripts/bundle-python-deps.sh`** — Script to pip-install pure-Python deps into `ios/pyxios/Resources/site-packages/`, copy backend/*.py to `ios/pyxios/Resources/backend/`, copy frontend/dist to `ios/pyxios/Resources/frontend-dist/`

### Files to modify:
- **`ios/pyxios/pyxios/Python/PythonRunner.swift`** — Replace health-polling stub with real embedding:
  1. Set PYTHONHOME (Python.framework in bundle), PYTHONPATH (backend + site-packages), PYTHONDONTWRITEBYTECODE=1, PYXUS_DATA_DIR (Documents dir)
  2. Call Py_Initialize() on background DispatchQueue
  3. Run bootstrap.py via PyRun_SimpleString (blocks on that thread — uvicorn event loop)
  4. Poll /api/health from async context until ready
- **`ios/pyxios/pyxios/Python/bootstrap.py`** — Simplify: use PYXUS_DATA_DIR for chdir, just import uvicorn and run
- **`backend/main.py`** — Two env var overrides:
  - `SETTINGS_PATH`: use `PYXUS_DATA_DIR` if set (Documents dir, writable), else `__file__` dir
  - `frontend_dist`: use `PYXUS_FRONTEND_DIR` if set, else relative path

### Dependencies strategy:
- uvicorn WITHOUT [standard] (pure Python, uses asyncio + h11 instead of uvloop + httptools)
- All other deps are pure Python: fastapi, starlette, anyio, pydantic, pymavlink, websockets
- **pydantic-core issue**: pydantic v2 needs pydantic-core (Rust C extension). Options:
  - Cross-compile for iOS arm64 (complex but proper)
  - Temporarily pin pydantic<2 and adjust ~5 BaseModel classes (simpler, ship faster)

### Xcode project changes (manual, via Xcode UI):
- Add Python.xcframework to Frameworks (Embed & Sign)
- Set bridging header in Build Settings
- Add Resources/site-packages, Resources/backend, Resources/frontend-dist as Copy Bundle Resources
- ENABLE_BITCODE = NO

### Verification:
- `cd frontend && npx vite build` (frontend still builds)
- `cd backend && python3 -c "import ast; ast.parse(open('main.py').read())"` (backend syntax valid)
- Xcode build succeeds on iOS simulator
- App launches, Python starts, /api/health responds, WebView loads
