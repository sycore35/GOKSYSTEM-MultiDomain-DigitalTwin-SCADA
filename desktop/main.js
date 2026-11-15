const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let backendProcess = null;

const PORT = process.env.GOKSYSTEM_PORT || 8000;
const HOST = '127.0.0.1';

// Resolve writable persistent directory for SQLite database
function getAppDataDir() {
  const userData = app.getPath('userData');
  return userData;
}

// Check backend health
function checkHealth(callback, retries = 30) {
  const req = http.get(`http://${HOST}:${PORT}/api/v1/health`, (res) => {
    if (res.statusCode === 200) {
      callback(true);
    } else if (retries > 0) {
      setTimeout(() => checkHealth(callback, retries - 1), 500);
    } else {
      callback(false);
    }
  });

  req.on('error', () => {
    if (retries > 0) {
      setTimeout(() => checkHealth(callback, retries - 1), 500);
    } else {
      callback(false);
    }
  });
}

// Launch backend process
function startBackend() {
  const isDev = !app.isPackaged;
  const appData = getAppDataDir();
  
  let exePath;
  let args = [];
  let cwd;

  if (isDev) {
    const packagedDistExe = path.join(__dirname, '..', 'packaging', 'dist', 'goksystem-core', 'goksystem-core.exe');
    const fs = require('fs');
    if (fs.existsSync(packagedDistExe)) {
      exePath = packagedDistExe;
      cwd = path.dirname(packagedDistExe);
    } else {
      exePath = 'python';
      args = ['-m', 'uvicorn', 'goksystem.main:app', '--host', HOST, '--port', String(PORT)];
      cwd = path.join(__dirname, '..');
    }
  } else {
    // Packaged mode
    exePath = path.join(process.resourcesPath, 'backend', 'goksystem-core.exe');
    cwd = path.dirname(exePath);
  }

  const env = Object.assign({}, process.env, {
    GOKSYSTEM_DATA_DIR: appData,
    GOKSYSTEM_PORT: String(PORT),
    GOKSYSTEM_HOST: HOST
  });

  console.log(`[DESKTOP SHELL] Spawning backend: ${exePath}`);
  backendProcess = spawn(exePath, args, { cwd, env });

  backendProcess.stdout.on('data', (d) => console.log(`[BACKEND] ${d}`));
  backendProcess.stderr.on('data', (d) => console.error(`[BACKEND ERR] ${d}`));

  backendProcess.on('exit', (code) => {
    console.log(`[DESKTOP SHELL] Backend exited with code ${code}`);
    backendProcess = null;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#080B10',
    title: 'GÖKSYSTEM 3.0 — Multi-Domain Digital Twin & SCADA',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.removeMenu();

  const isDev = !app.isPackaged;
  if (isDev) {
    // In dev / preview mode, connect to Vite or dist
    mainWindow.loadURL('http://127.0.0.1:5173').catch(() => {
      const distPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
      mainWindow.loadFile(distPath);
    });
  } else {
    const distPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
    mainWindow.loadFile(distPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Lifecycle
app.whenReady().then(() => {
  startBackend();

  checkHealth((healthy) => {
    if (healthy) {
      console.log('[DESKTOP SHELL] Backend confirmed healthy. Opening interface.');
      createWindow();
    } else {
      dialog.showErrorBox(
        'GÖKSYSTEM 3.0 — Initialization Failure',
        `Failed to establish communication with SCADA Core engine on port ${PORT}. Please verify system permissions.`
      );
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (backendProcess) {
    console.log('[DESKTOP SHELL] Gracefully terminating backend process...');
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t']);
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.error('Error shutting down backend:', e);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
