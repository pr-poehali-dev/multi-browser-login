const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const bm = require('./browser-manager');

// Инициализируем browser-manager — передаём функции для отправки событий в UI
function sendToWindow(win, channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  bm.init(
    (data) => sendToWindow(mainWindow, 'browser:status', data),
    (data) => sendToWindow(mainWindow, 'browser:log', data)
  );
}

// IPC handlers
ipcMain.handle('browser:launch', async (_e, opts) => {
  try {
    const data = await bm.launchBrowser(opts);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('browser:close', async (_e, id) => {
  try {
    await bm.closeBrowser(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('browser:pause', (_e, id) => {
  try {
    bm.pauseBrowser(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('browser:resume', (_e, id) => {
  try {
    bm.resumeBrowser(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('browser:list', () => {
  try {
    return { ok: true, data: bm.listBrowsers() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('browser:runScenario', async (_e, opts) => {
  try {
    const data = await bm.runScenario(opts);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('browser:getLogs', (_e, filter) => {
  try {
    return { ok: true, data: bm.getLogs(filter) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('browser:clearLogs', () => {
  try {
    bm.clearLogs();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Жизненный цикл приложения
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
