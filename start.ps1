# PowerShell script to start Pyxus frontend and backend
$ErrorActionPreference = "Stop"

$ROOT_DIR = $PSScriptRoot

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "         PYXUS - Drone Control          " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Python is available
Write-Host "Checking Python..." -NoNewline
try {
    $null = Get-Command python -ErrorAction Stop
    $pythonVersion = python --version 2>&1
    Write-Host " $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host " NOT FOUND" -ForegroundColor Red
    Write-Host ""
    Write-Host "ERROR: Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Python 3.7+ from https://www.python.org/"
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if npm is available
Write-Host "Checking npm..." -NoNewline
try {
    $null = Get-Command npm -ErrorAction Stop
    $npmVersion = npm --version 2>&1
    Write-Host " v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host " NOT FOUND" -ForegroundColor Red
    Write-Host ""
    Write-Host "ERROR: npm is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Create virtual environment if it doesn't exist
if (-not (Test-Path "$ROOT_DIR\backend\venv")) {
    Write-Host "[backend] Creating virtual environment..." -ForegroundColor Green
    python -m venv "$ROOT_DIR\backend\venv"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create virtual environment" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Install backend dependencies
Write-Host "[backend] Installing dependencies..." -ForegroundColor Green
& "$ROOT_DIR\backend\venv\Scripts\Activate.ps1"
pip install -q -r "$ROOT_DIR\backend\requirements.txt"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install backend dependencies" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Install frontend dependencies if needed
if (-not (Test-Path "$ROOT_DIR\frontend\node_modules")) {
    Write-Host "[frontend] Installing dependencies..." -ForegroundColor Green
    Push-Location "$ROOT_DIR\frontend"
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install frontend dependencies" -ForegroundColor Red
        Pop-Location
        Read-Host "Press Enter to exit"
        exit 1
    }
    Pop-Location
}

Write-Host ""
Write-Host "[backend] Starting FastAPI on http://localhost:8000" -ForegroundColor Green
Write-Host "[frontend] Starting Vite on http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop both servers" -ForegroundColor Yellow
Write-Host ""

# Start backend in a background job
$backendJob = Start-Job -ScriptBlock {
    param($rootDir)
    Set-Location "$rootDir\backend"
    & "$rootDir\backend\venv\Scripts\Activate.ps1"
    uvicorn main:app --reload --port 8000
} -ArgumentList $ROOT_DIR

# Give backend a moment to start
Start-Sleep -Seconds 2

# Start frontend in a background job
$frontendJob = Start-Job -ScriptBlock {
    param($rootDir)
    Set-Location "$rootDir\frontend"
    npm run dev
} -ArgumentList $ROOT_DIR

# Cleanup function
function Cleanup {
    Write-Host ""
    Write-Host "Shutting down..." -ForegroundColor Cyan

    if ($backendJob) {
        Write-Host "Stopping backend..." -ForegroundColor Yellow
        Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
        Remove-Job -Job $backendJob -Force -ErrorAction SilentlyContinue
    }

    if ($frontendJob) {
        Write-Host "Stopping frontend..." -ForegroundColor Yellow
        Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
        Remove-Job -Job $frontendJob -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Done." -ForegroundColor Green
}

# Handle Ctrl+C
try {
    # Display output from both jobs
    while ($backendJob.State -eq 'Running' -or $frontendJob.State -eq 'Running') {
        # Get and display backend output
        $backendOutput = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
        if ($backendOutput) {
            $backendOutput | ForEach-Object { Write-Host "[backend] $_" }
        }

        # Get and display frontend output
        $frontendOutput = Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
        if ($frontendOutput) {
            $frontendOutput | ForEach-Object { Write-Host "[frontend] $_" -ForegroundColor Cyan }
        }

        Start-Sleep -Milliseconds 500
    }

    # Check if jobs exited unexpectedly
    if ($backendJob.State -ne 'Running') {
        Write-Host ""
        Write-Host "Backend job stopped" -ForegroundColor Red
        Receive-Job -Job $backendJob -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[backend] $_" }
    }
    if ($frontendJob.State -ne 'Running') {
        Write-Host ""
        Write-Host "Frontend job stopped" -ForegroundColor Red
        Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[frontend] $_" -ForegroundColor Cyan }
    }
} catch {
    # Ctrl+C or other interruption
} finally {
    Cleanup
}
