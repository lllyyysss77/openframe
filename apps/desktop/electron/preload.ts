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

// --------- Expose Genres API to the Renderer process ---------
type GenreRow = { id: string; name: string; code: string; description: string; thumbnail: string | null; category_id: string | null; created_at: number }
type CategoryRow = { id: string; name: string; code: string; created_at: number }

// --------- Expose Thumbnails API to the Renderer process ---------
contextBridge.exposeInMainWorld('thumbnailsAPI', {
  save: (data: Uint8Array, ext: string): Promise<string> =>
    ipcRenderer.invoke('thumbnails:save', data, ext),
  delete: (filepath: string): Promise<void> =>
    ipcRenderer.invoke('thumbnails:delete', filepath),
})

contextBridge.exposeInMainWorld('aiAPI', {
  getConfig: (): Promise<unknown> =>
    ipcRenderer.invoke('ai:getConfig'),
  saveConfig: (config: unknown): Promise<void> =>
    ipcRenderer.invoke('ai:saveConfig', config),
  testConnection: (params: { providerId: string; modelId: string; apiKey: string; baseUrl?: string }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('ai:testConnection', params),
})

contextBridge.exposeInMainWorld('genresAPI', {
  getAll: (): Promise<GenreRow[]> => ipcRenderer.invoke('genres:getAll'),
  insert: (genre: GenreRow): Promise<void> => ipcRenderer.invoke('genres:insert', genre),
  update: (genre: GenreRow): Promise<void> => ipcRenderer.invoke('genres:update', genre),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('genres:delete', id),
})

contextBridge.exposeInMainWorld('categoriesAPI', {
  getAll: (): Promise<CategoryRow[]> => ipcRenderer.invoke('categories:getAll'),
  insert: (category: CategoryRow): Promise<void> => ipcRenderer.invoke('categories:insert', category),
  update: (category: CategoryRow): Promise<void> => ipcRenderer.invoke('categories:update', category),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('categories:delete', id),
})
