const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const {
  launchBrowser,
  closeBrowser,
  pauseBrowser,
  resumeBrowser,
  listBrowsers,
  getLogs,
  clearLogs,
  emitter,
} = require('./browser-manager')

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}

// Слушаем события от browser-manager и отправляем в рендерер
emitter.on('log', (log) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('browser:log', log)
  }
})

emitter.on('browser-status', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('browser:status', data)
  }
})

// IPC: запустить браузер
ipcMain.handle('browser:launch', async (_event, options) => {
  try {
    const result = await launchBrowser(options)
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: закрыть браузер
ipcMain.handle('browser:close', async (_event, id) => {
  try {
    const result = await closeBrowser(id)
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: пауза
ipcMain.handle('browser:pause', async (_event, id) => {
  try {
    return { ok: true, data: pauseBrowser(id) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: возобновить
ipcMain.handle('browser:resume', async (_event, id) => {
  try {
    return { ok: true, data: resumeBrowser(id) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: список запущенных
ipcMain.handle('browser:list', async () => {
  return { ok: true, data: listBrowsers() }
})

// IPC: запустить сценарий на нескольких аккаунтах
ipcMain.handle('scenario:run', async (_event, { scenario, accounts, settings }) => {
  const results = []
  for (const account of accounts) {
    try {
      const url = account.site || 'about:blank'
      const result = await launchBrowser({
        url,
        proxy: account.proxy || undefined,
        account: account.login,
        scenarioName: scenario.name,
        steps: scenario.steps,
        settings,
      })
      results.push({ ok: true, accountLogin: account.login, data: result })
    } catch (err) {
      results.push({ ok: false, accountLogin: account.login, error: err.message })
    }
  }
  return { ok: true, data: results }
})

// IPC: получить логи
ipcMain.handle('logs:get', async (_event, filter) => {
  return { ok: true, data: getLogs(filter) }
})

// IPC: очистить логи
ipcMain.handle('logs:clear', async () => {
  clearLogs()
  return { ok: true }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
