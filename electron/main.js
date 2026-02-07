const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let mainWindow;
let backendProcess;

const BACKEND_PORT = 8000;
const isDev = process.argv.includes('--dev');

function waitForBackend(retries = 30) {
  return new Promise((resolve, reject) => {
    const check = (attempt) => {
      http.get(`http://localhost:${BACKEND_PORT}/api/status`, (res) => {
        resolve();
      }).on('error', () => {
        if (attempt >= retries) {
          reject(new Error('Backend failed to start'));
        } else {
          setTimeout(() => check(attempt + 1), 500);
        }
      });
    };
    check(0);
  });
}

function startBackend() {
  const backendDir = isDev
    ? path.join(__dirname, '..', 'backend')
    : path.join(process.resourcesPath, 'backend');

  // Use venv python if available, otherwise system python
  const venvPython = path.join(backendDir, 'venv', 'bin', 'python3');
  const systemPython = process.platform === 'win32' ? 'python' : 'python3';
  const pythonPath = require('fs').existsSync(venvPython) ? venvPython : systemPython;

  console.log('Starting backend from:', backendDir);

  backendProcess = spawn(pythonPath, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)], {
    cwd: backendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  backendProcess.stdout.on('data', (data) => {
    console.log('[Backend]', data.toString().trim());
  });

  backendProcess.stderr.on('data', (data) => {
    console.error('[Backend]', data.toString().trim());
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
  });

  backendProcess.on('exit', (code) => {
    console.log('Backend exited with code:', code);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Pyxus',
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Remove default menu bar on Windows/Linux
    autoHideMenuBar: true,
  });

  // Load the app
  if (isDev) {
    // In dev mode, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // In production, load built files
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Start backend
  startBackend();

  // Wait for backend to be ready
  try {
    console.log('Waiting for backend...');
    await waitForBackend();
    console.log('Backend ready');
  } catch (err) {
    console.error('Backend startup failed:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    console.log('Stopping backend...');
    backendProcess.kill();
  }
});
