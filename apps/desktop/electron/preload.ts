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
type GenreRow = { id: string; name: string; code: string; description: string; prompt: string; thumbnail: string | null; created_at: number }
type CategoryRow = { id: string; name: string; code: string; created_at: number }
type ProjectRow = {
  id: string
  name: string
  video_ratio: '16:9' | '9:16'
  thumbnail: string | null
  category: string
  genre: string
  series_count: number
  created_at: number
}
type SeriesRow = {
  id: string
  project_id: string
  sort_index: number
  thumbnail: string | null
  duration: number
  created_at: number
}

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
  embed: (text: string): Promise<number[] | null> =>
    ipcRenderer.invoke('ai:embed', text),
  embedBatch: (texts: string[]): Promise<number[][] | null> =>
    ipcRenderer.invoke('ai:embedBatch', texts),
  generateImage: (
    params: { prompt: string; modelKey?: string },
  ): Promise<{ ok: true; data: number[]; mediaType: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:generateImage', params),
  styleAgentChat: (
    params: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      draft: { name: string; code: string; description: string; prompt: string }
      modelKey?: string
    },
  ): Promise<{ ok: true; reply: string; draft: { name: string; code: string; description: string; prompt: string } } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:styleAgentChat', params),
})

contextBridge.exposeInMainWorld('vectorsAPI', {
  getDimension: (): Promise<number> =>
    ipcRenderer.invoke('vectors:getDimension'),
  insertDocument: (doc: { id: string; title: string; type: string; project_id?: string }): Promise<void> =>
    ipcRenderer.invoke('vectors:insertDocument', doc),
  insertChunk: (chunk: { document_id: string; content: string; chunk_index: number; embedding: number[] }): Promise<number> =>
    ipcRenderer.invoke('vectors:insertChunk', chunk),
  search: (params: { embedding: number[]; limit?: number; document_id?: string }): Promise<{ chunk_id: number; document_id: string; content: string; chunk_index: number; distance: number }[]> =>
    ipcRenderer.invoke('vectors:search', params),
  deleteDocument: (document_id: string): Promise<void> =>
    ipcRenderer.invoke('vectors:deleteDocument', document_id),
})

contextBridge.exposeInMainWorld('dataAPI', {
  getInfo: (): Promise<{ defaultDir: string; currentDir: string; pendingDir: string; dbSize: number; thumbsSize: number }> =>
    ipcRenderer.invoke('data:getInfo'),
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('data:selectDirectory'),
  setDirectory: (dir: string): Promise<void> =>
    ipcRenderer.invoke('data:setDirectory', dir),
  resetDirectory: (): Promise<void> =>
    ipcRenderer.invoke('data:resetDirectory'),
  openDirectory: (): Promise<void> =>
    ipcRenderer.invoke('data:openDirectory'),
  restart: (): Promise<void> =>
    ipcRenderer.invoke('data:restart'),
})

contextBridge.exposeInMainWorld('genresAPI', {
  getAll: (): Promise<GenreRow[]> => ipcRenderer.invoke('genres:getAll'),
  insert: (genre: GenreRow): Promise<void> => ipcRenderer.invoke('genres:insert', genre),
  update: (genre: GenreRow): Promise<void> => ipcRenderer.invoke('genres:update', genre),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('genres:delete', id),
})

contextBridge.exposeInMainWorld('projectsAPI', {
  getAll: (): Promise<ProjectRow[]> => ipcRenderer.invoke('projects:getAll'),
  insert: (project: ProjectRow): Promise<void> => ipcRenderer.invoke('projects:insert', project),
  update: (project: ProjectRow): Promise<void> => ipcRenderer.invoke('projects:update', project),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('projects:delete', id),
})

contextBridge.exposeInMainWorld('seriesAPI', {
  getAll: (): Promise<SeriesRow[]> => ipcRenderer.invoke('series:getAll'),
  getByProject: (projectId: string): Promise<SeriesRow[]> => ipcRenderer.invoke('series:getByProject', projectId),
  insert: (series: SeriesRow): Promise<void> => ipcRenderer.invoke('series:insert', series),
  update: (series: SeriesRow): Promise<void> => ipcRenderer.invoke('series:update', series),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('series:delete', id),
})

contextBridge.exposeInMainWorld('categoriesAPI', {
  getAll: (): Promise<CategoryRow[]> => ipcRenderer.invoke('categories:getAll'),
  insert: (category: CategoryRow): Promise<void> => ipcRenderer.invoke('categories:insert', category),
  update: (category: CategoryRow): Promise<void> => ipcRenderer.invoke('categories:update', category),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('categories:delete', id),
})
