/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

type GenreRow = { id: string; name: string; code: string; description: string; thumbnail: string | null; category_id: string | null; created_at: number }
type CategoryRow = { id: string; name: string; code: string; created_at: number }
type ChunkSearchResult = { chunk_id: number; document_id: string; content: string; chunk_index: number; distance: number }
type DataInfo = { defaultDir: string; currentDir: string; pendingDir: string; dbSize: number; thumbsSize: number }

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  aiAPI: {
    getConfig: () => Promise<unknown>
    saveConfig: (config: unknown) => Promise<void>
    testConnection: (params: { providerId: string; modelId: string; apiKey: string; baseUrl?: string }) => Promise<{ ok: boolean; error?: string }>
    embed: (text: string) => Promise<number[] | null>
    embedBatch: (texts: string[]) => Promise<number[][] | null>
  }
  settingsAPI: {
    getAll: () => Promise<Array<{ key: string; value: string }>>
    upsert: (key: string, value: string) => Promise<void>
    delete: (key: string) => Promise<void>
  }
  thumbnailsAPI: {
    save: (data: Uint8Array, ext: string) => Promise<string>
    delete: (filepath: string) => Promise<void>
  }
  genresAPI: {
    getAll: () => Promise<GenreRow[]>
    insert: (genre: GenreRow) => Promise<void>
    update: (genre: GenreRow) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  categoriesAPI: {
    getAll: () => Promise<CategoryRow[]>
    insert: (category: CategoryRow) => Promise<void>
    update: (category: CategoryRow) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  vectorsAPI: {
    getDimension: () => Promise<number>
    insertDocument: (doc: { id: string; title: string; type: string; project_id?: string }) => Promise<void>
    insertChunk: (chunk: { document_id: string; content: string; chunk_index: number; embedding: number[] }) => Promise<number>
    search: (params: { embedding: number[]; limit?: number; document_id?: string }) => Promise<ChunkSearchResult[]>
    deleteDocument: (document_id: string) => Promise<void>
  }
  dataAPI: {
    getInfo: () => Promise<DataInfo>
    selectDirectory: () => Promise<string | null>
    setDirectory: (dir: string) => Promise<void>
    resetDirectory: () => Promise<void>
    openDirectory: () => Promise<void>
    restart: () => Promise<void>
  }
}
