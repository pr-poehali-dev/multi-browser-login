const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Браузеры
  launchBrowser:  (options)  => ipcRenderer.invoke('browser:launch', options),
  closeBrowser:   (id)       => ipcRenderer.invoke('browser:close', id),
  pauseBrowser:   (id)       => ipcRenderer.invoke('browser:pause', id),
  resumeBrowser:  (id)       => ipcRenderer.invoke('browser:resume', id),
  listBrowsers:   ()         => ipcRenderer.invoke('browser:list'),

  // Сценарии
  runScenario:    (opts)     => ipcRenderer.invoke('scenario:run', opts),

  // Логи
  getLogs:        (filter)   => ipcRenderer.invoke('logs:get', filter),
  clearLogs:      ()         => ipcRenderer.invoke('logs:clear'),

  // Подписки на события в реальном времени
  onBrowserStatus: (cb) => {
    ipcRenderer.on('browser:status', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('browser:status')
  },
  onLog: (cb) => {
    ipcRenderer.on('browser:log', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('browser:log')
  },

  // Диалоги и утилиты
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  detectChrome:   () => ipcRenderer.invoke('browser:detectChrome'),
})