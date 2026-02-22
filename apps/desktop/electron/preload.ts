import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

// --------- Expose SQLite API to the Renderer process ---------
contextBridge.exposeInMainWorld('sqlite', {
  query: (sql: string, params?: unknown[]) =>
    ipcRenderer.invoke('db:query', sql, params),
  select: (sql: string, params?: unknown[]) =>
    ipcRenderer.invoke('db:select', sql, params),
})

// --------- Expose Settings API to the Renderer process ---------
contextBridge.exposeInMainWorld('settingsAPI', {
  getAll: (): Promise<Array<{ key: string; value: string }>> =>
    ipcRenderer.invoke('settings:getAll'),
  upsert: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('settings:upsert', key, value),
  delete: (key: string): Promise<void> =>
    ipcRenderer.invoke('settings:delete', key),
})
