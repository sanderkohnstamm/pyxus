# Pyxus GCS - Startup Guide

## Quick Start

```powershell
.\start.ps1
```

This single command starts both backend and frontend servers.

## Verification Steps

### 1. Check Backend Started Successfully

Look for this output:
```
[backend] INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
[backend] INFO:     Started reloader process
[backend] INFO:     Started server process
[backend] INFO:     Application startup complete.
```

**Test it:**
- Open http://localhost:8000/docs
- You should see FastAPI interactive documentation
- Verify these endpoints exist:
  - `/api/weather/route`
  - `/api/weather/platforms`
  - `/api/mission/upload`
  - `/ws` (WebSocket)

### 2. Check Frontend Started Successfully

Look for this output:
```
[frontend] VITE v6.x.x  ready in XXX ms
[frontend] ➜  Local:   http://localhost:5173/
[frontend] ➜  Network: use --host to expose
```

**Test it:**
- Open http://localhost:5173
- You should see Pyxus GCS interface
- Check browser console (F12) for errors

### 3. Test Offline Mission Planning

**No drone connection needed!**

1. Go to **Planning** tab
2. Click **"Add Waypoints"** button (bottom-right)
3. Click on map to place 2-3 waypoints
4. Waypoints should appear with numbers
5. Click **Mission** subtab
6. You should see waypoint list
7. Try:
   - Edit altitude by clicking waypoint
   - Drag waypoints on map to move them
   - Reorder with drag handles
   - Click **Save** to export as JSON
   - Click **Load** to import JSON
   - Click **Clear** to remove all

### 4. Test Weather Analysis

**Requires backend running!**

1. Make sure you have 2+ waypoints
2. Click **Weather** subtab (purple cloud icon)
3. You should see:
   - Platform selector dropdown
   - "No weather data yet" message
   - "Fetch Weather" button
4. Click **"Fetch Weather"**
5. Check browser console (F12) for:
   ```
   [Weather] Fetching weather for X waypoints
   [Weather] API response: {status: "ok", ...}
   [Weather] Analysis loaded successfully
   ```
6. You should see:
   - Risk level card (SAFE/CAUTION/WARNING/ABORT)
   - Energy penalty percentage
   - Critical segments (if any)
   - Waypoint weather details
7. On the map, you should see:
   - Wind vector arrows at each waypoint
   - Risk circles around waypoints (color-coded)

## Troubleshooting

### Backend Won't Start

**Error:** `ImportError: No module named 'httpx'`
```powershell
cd backend
.\venv\Scripts\activate
pip install httpx
```

**Error:** `ModuleNotFoundError: No module named 'weather'`
- Check `backend/weather.py` exists
- Restart backend

**Error:** `Address already in use`
- Another process using port 8000
- Find and kill it: `Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process`

### Frontend Won't Start

**Error:** `EADDRINUSE: address already in use :::5173`
- Another process using port 5173
- Kill it or use different port

**Error:** `npm ERR! missing script: dev`
- Check `frontend/package.json` has dev script
- Run `npm install` in frontend directory

### Weather Not Loading

**Symptom:** "ERR_CONNECTION_REFUSED" in browser console

**Check:**
1. Is backend running? Open http://localhost:8000/docs
2. Does `/api/weather/route` endpoint exist in docs?
3. Check backend console for errors
4. Try manually:
   ```powershell
   cd backend
   .\venv\Scripts\activate
   uvicorn main:app --reload --port 8000
   ```

**Symptom:** "No weather data yet" never changes

**Check:**
1. Open browser console (F12)
2. Look for `[Weather]` messages
3. Check Network tab for `/api/weather/route` request
4. Look for error responses

### Map Clicks Not Working

**Symptom:** Clicking map doesn't add waypoints

**Check:**
1. Is "Add Waypoints" button clicked? (should show "Adding Waypoints...")
2. Is cursor a crosshair? (if not, button not active)
3. Are you in Planning tab?
4. Check browser console for errors

## Port Configuration

- **Backend:** http://localhost:8000
- **Frontend:** http://localhost:5173
- **WebSocket:** ws://localhost:8000/ws

If you need to change ports:
1. Backend: Edit `start.ps1` line 90 (`--port 8000`)
2. Frontend: Edit `frontend/vite.config.js` line 7 (`port: 5173`)
3. Update proxy target in `vite.config.js` lines 10 & 14

## Environment Requirements

- **Python:** 3.7+ (check: `python --version`)
- **Node.js:** 16+ (check: `node --version`)
- **npm:** 8+ (check: `npm --version`)

## Clean Restart

If things are acting weird, try a clean restart:

```powershell
# Stop all processes
Get-Process python,node | Stop-Process -Force

# Navigate to project root
cd c:\Users\marc\Desktop\Demo's\Prototypes\pyxus

# Start fresh
.\start.ps1
```

## File Structure

```
pyxus/
├── start.ps1              # PowerShell startup script
├── start.bat             # Batch startup script (alternative)
├── start.sh              # Bash startup script (Linux/Mac)
├── backend/
│   ├── main.py           # FastAPI app
│   ├── weather.py        # Weather service
│   ├── drone.py          # Drone connection
│   ├── mission.py        # Mission management
│   ├── requirements.txt  # Python dependencies
│   └── venv/            # Python virtual environment
└── frontend/
    ├── src/
    │   ├── components/   # React components
    │   ├── hooks/       # React hooks
    │   └── store/       # Zustand state
    ├── package.json     # Node dependencies
    └── vite.config.js   # Vite configuration
```

## Getting Help

1. Check browser console (F12) for errors
2. Check terminal output for backend/frontend errors
3. Verify backend running: http://localhost:8000/docs
4. Verify frontend running: http://localhost:5173
5. Review MEMORY.md for common issues

## Success Indicators

✅ Backend shows "Application startup complete"
✅ Frontend shows Vite dev server URL
✅ http://localhost:8000/docs loads and shows API endpoints
✅ http://localhost:5173 loads Pyxus interface
✅ Can add waypoints by clicking map (Planning tab)
✅ Weather analysis works (Weather subtab)
✅ No errors in browser console
✅ Can save/load missions to files
