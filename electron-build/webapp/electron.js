const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
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

  // Ищем dist/index.html — сначала рядом с electron.js, потом через appPath
  const appPath = app.getAppPath();
  const candidates = [
    path.join(__dirname, 'dist', 'index.html'),
    path.join(appPath, 'dist', 'index.html'),
  ];
  const indexPath = candidates.find(p => fs.existsSync(p));

  if (indexPath) {
    mainWindow.loadFile(indexPath);
  } else if (!app.isPackaged) {
    // Только в режиме разработки — грузим dev-сервер
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Диагностика — показываем пути для отладки
    const info = candidates.map(p => `${p} — ${fs.existsSync(p) ? 'НАЙДЕН' : 'НЕТ'}`).join('\n');
    mainWindow.loadURL('data:text/html,' + encodeURIComponent(
      `<html><body style="background:#0a0612;color:#e2e8f0;font-family:monospace;padding:40px;white-space:pre">` +
      `MBA Browser — dist/index.html не найден\n\n${info}\n\nappPath: ${appPath}\n__dirname: ${__dirname}` +
      `</body></html>`
    ));
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

ipcMain.handle('browser:detectChrome', () => {
  try {
    const chromePath = bm.getDefaultChromiumPath();
    if (!chromePath) return { ok: false, path: null };
    let displayPath = chromePath;
    if (process.platform === 'darwin') {
      const appMatch = chromePath.match(/^(.+\.app)\//);
      if (appMatch) displayPath = appMatch[1];
    }
    return { ok: true, path: displayPath };
  } catch {
    return { ok: false, path: null };
  }
});

ipcMain.handle('dialog:openFile', async () => {
  const isMac = process.platform === 'darwin';
  const result = await dialog.showOpenDialog(mainWindow, {
    title: isMac ? 'Выбери Chrome / Chromium (.app)' : 'Выбери исполняемый файл Chrome / Chromium',
    properties: ['openFile'],
    filters: process.platform === 'win32'
      ? [{ name: 'Executable', extensions: ['exe'] }]
      : [],
    message: isMac ? 'Выбери приложение Google Chrome или Chromium' : undefined,
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false };
  return { ok: true, path: result.filePaths[0] };
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