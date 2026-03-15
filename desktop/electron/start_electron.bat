@echo off
REM Start Pyxus Electron app in development mode (Windows)

set SCRIPT_DIR=%~dp0
set FRONTEND_DIR=%SCRIPT_DIR%..\frontend
set ELECTRON_DIR=%SCRIPT_DIR%

echo Starting Pyxus...

REM Start Vite dev server in background
echo Starting Vite dev server...
cd /d "%FRONTEND_DIR%"
start /b npx vite --port 5173

REM Wait for Vite to be ready
echo Waiting for Vite...
:wait_vite
timeout /t 1 /nobreak >nul
curl -s http://localhost:5173 >nul 2>&1
if errorlevel 1 goto wait_vite
echo Vite ready

REM Start Electron
echo Starting Electron...
cd /d "%ELECTRON_DIR%"
call npm start

echo Shutting down...
REM Note: Vite process will need to be killed manually or will exit when terminal closes
