const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { launchBrowser, closeBrowser, listBrowsers } = require('./browser-manager')

function createWindow() {
  const win = new BrowserWindow({
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

  win.loadFile(path.join(__dirname, '../dist/index.html'))
}

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

// IPC: список запущенных
ipcMain.handle('browser:list', async () => {
  return { ok: true, data: listBrowsers() }
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
