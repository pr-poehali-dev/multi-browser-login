const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  launchBrowser: (opts) => ipcRenderer.invoke('browser:launch', opts),
  closeBrowser: (id) => ipcRenderer.invoke('browser:close', id),
  pauseBrowser: (id) => ipcRenderer.invoke('browser:pause', id),
  resumeBrowser: (id) => ipcRenderer.invoke('browser:resume', id),
  listBrowsers: () => ipcRenderer.invoke('browser:list'),
  runScenario: (opts) => ipcRenderer.invoke('browser:runScenario', opts),
  getLogs: (filter) => ipcRenderer.invoke('browser:getLogs', filter),
  clearLogs: () => ipcRenderer.invoke('browser:clearLogs'),

  onBrowserStatus: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('browser:status', handler);
    return () => ipcRenderer.removeListener('browser:status', handler);
  },

  onLog: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('browser:log', handler);
    return () => ipcRenderer.removeListener('browser:log', handler);
  },

  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
});