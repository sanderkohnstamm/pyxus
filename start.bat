@echo off
setlocal enabledelayedexpansion

set "ROOT_DIR=%~dp0"
set "ROOT_DIR=%ROOT_DIR:~0,-1%"

echo =========================================
echo          PYXUS - Drone Control
echo =========================================
echo.

REM Check if Python is available
echo Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7+ from https://www.python.org/
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)
echo Python found!

REM Check if npm is available
echo Checking npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: npm is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)
echo npm found!

REM Check if backend virtual environment exists
if not exist "%ROOT_DIR%\backend\venv" (
    echo [backend] Creating virtual environment...
    python -m venv "%ROOT_DIR%\backend\venv"
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
)

echo [backend] Installing dependencies...
call "%ROOT_DIR%\backend\venv\Scripts\activate.bat"
pip install -q -r "%ROOT_DIR%\backend\requirements.txt"

REM Check if frontend node_modules exists
if not exist "%ROOT_DIR%\frontend\node_modules" (
    echo [frontend] Installing dependencies...
    cd /d "%ROOT_DIR%\frontend"
    call npm install
)

echo.
echo [backend] Starting FastAPI on http://localhost:8000
echo [frontend] Starting Vite on http://localhost:5173
echo.
echo Press Ctrl+C to stop both servers
echo.

REM Start backend in new window
cd /d "%ROOT_DIR%\backend"
start "Pyxus Backend" cmd /c "call venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"

REM Give backend a moment to start
timeout /t 2 /nobreak >nul

REM Start frontend in new window
cd /d "%ROOT_DIR%\frontend"
start "Pyxus Frontend" cmd /c "npm run dev"

echo Both servers started in separate windows.
echo Close this window or press any key to stop monitoring...
pause >nul

REM Note: On Windows, the spawned processes will continue running in their own windows
REM To stop them, close the individual windows or use Task Manager
