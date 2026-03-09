const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  launchBrowser: (options) => ipcRenderer.invoke('browser:launch', options),
  closeBrowser:  (id)      => ipcRenderer.invoke('browser:close', id),
  listBrowsers:  ()        => ipcRenderer.invoke('browser:list'),
  onBrowserStatus: (cb)    => {
    ipcRenderer.on('browser:status', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('browser:status')
  },
})
