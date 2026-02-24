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
  title: string
  script: string
  sort_index: number
  thumbnail: string | null
  duration: number
  created_at: number
}
type CharacterRow = {
  id: string
  project_id: string
  name: string
  gender: '' | 'male' | 'female' | 'other'
  age: '' | 'child' | 'youth' | 'young_adult' | 'adult' | 'middle_aged' | 'elder'
  personality: string
  thumbnail: string | null
  appearance: string
  background: string
  created_at: number
}
type SceneRow = {
  id: string
  series_id: string
  title: string
  location: string
  time: string
  mood: string
  description: string
  shot_notes: string
  thumbnail: string | null
  created_at: number
}
type ShotRow = {
  id: string
  series_id: string
  scene_id: string
  title: string
  shot_index: number
  shot_size: string
  camera_angle: string
  camera_move: string
  duration_sec: number
  action: string
  dialogue: string
  character_ids: string[]
  thumbnail: string | null
  created_at: number
}
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
    generateImage: (params: { prompt: string | { text?: string; images: Array<string | number[]> }; modelKey?: string }) => Promise<{ ok: true; data: number[]; mediaType: string } | { ok: false; error: string }>
    styleAgentChat: (params: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      draft: { name: string; code: string; description: string; prompt: string }
      modelKey?: string
    }) => Promise<{ ok: true; reply: string; draft: { name: string; code: string; description: string; prompt: string } } | { ok: false; error: string }>
    extractCharactersFromScript: (params: {
      script: string
      modelKey?: string
    }) => Promise<{ ok: true; characters: Array<{ name: string; gender: string; age: string; personality: string; appearance: string; background: string }> } | { ok: false; error: string }>
    enhanceCharacterFromScript: (params: {
      script: string
      character: { name: string; gender?: string; age?: string; personality?: string; appearance?: string; background?: string }
      modelKey?: string
    }) => Promise<{ ok: true; character: { name: string; gender: string; age: string; personality: string; appearance: string; background: string } } | { ok: false; error: string }>
    extractScenesFromScript: (params: {
      script: string
      modelKey?: string
    }) => Promise<{ ok: true; scenes: Array<{ title: string; location: string; time: string; mood: string; description: string; shot_notes: string }> } | { ok: false; error: string }>
    enhanceSceneFromScript: (params: {
      script: string
      scene: { title: string; location?: string; time?: string; mood?: string; description?: string; shot_notes?: string }
      modelKey?: string
    }) => Promise<{ ok: true; scene: { title: string; location: string; time: string; mood: string; description: string; shot_notes: string } } | { ok: false; error: string }>
    extractShotsFromScript: (params: {
      script: string
      scenes: Array<{ id: string; title: string }>
      characters: Array<{ id: string; name: string }>
      modelKey?: string
    }) => Promise<{ ok: true; shots: Array<{ title: string; scene_ref: string; character_refs: string[]; shot_size: string; camera_angle: string; camera_move: string; duration_sec: number; action: string; dialogue: string }> } | { ok: false; error: string }>
    scriptToolkit: (params: {
      action:
        | 'scene.expand'
        | 'scene.autocomplete'
        | 'scene.rewrite'
        | 'scene.dialogue-polish'
        | 'scene.pacing'
        | 'scene.continuity-check'
      context: string
      instruction?: string
      modelKey?: string
    }) => Promise<{ ok: true; text: string } | { ok: false; error: string }>
    scriptToolkitStreamStart: (params: {
      action:
        | 'scene.expand'
        | 'scene.autocomplete'
        | 'scene.rewrite'
        | 'scene.dialogue-polish'
        | 'scene.pacing'
        | 'scene.continuity-check'
      context: string
      instruction?: string
      modelKey?: string
    }) => Promise<{ ok: true; requestId: string } | { ok: false; error: string }>
    onScriptToolkitStreamChunk: (
      callback: (payload: { requestId: string; chunk?: string; done: boolean; error?: string }) => void,
    ) => () => void
  }
  settingsAPI: {
    getAll: () => Promise<Array<{ key: string; value: string }>>
    upsert: (key: string, value: string) => Promise<void>
    delete: (key: string) => Promise<void>
  }
  thumbnailsAPI: {
    save: (data: Uint8Array, ext: string) => Promise<string>
    delete: (filepath: string) => Promise<void>
    readBase64: (filepath: string) => Promise<string | null>
  }
  genresAPI: {
    getAll: () => Promise<GenreRow[]>
    insert: (genre: GenreRow) => Promise<void>
    update: (genre: GenreRow) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  projectsAPI: {
    getAll: () => Promise<ProjectRow[]>
    insert: (project: ProjectRow) => Promise<void>
    update: (project: ProjectRow) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  seriesAPI: {
    getAll: () => Promise<SeriesRow[]>
    getByProject: (projectId: string) => Promise<SeriesRow[]>
    insert: (series: SeriesRow) => Promise<void>
    update: (series: SeriesRow) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  charactersAPI: {
    getAll: () => Promise<CharacterRow[]>
    getByProject: (projectId: string) => Promise<CharacterRow[]>
    insert: (character: CharacterRow) => Promise<void>
    update: (character: CharacterRow) => Promise<void>
    delete: (id: string) => Promise<void>
    replaceByProject: (payload: { projectId: string; characters: CharacterRow[] }) => Promise<void>
  }
  scenesAPI: {
    getAll: () => Promise<SceneRow[]>
    getBySeries: (seriesId: string) => Promise<SceneRow[]>
    insert: (scene: SceneRow) => Promise<void>
    update: (scene: SceneRow) => Promise<void>
    delete: (id: string) => Promise<void>
    replaceBySeries: (payload: { seriesId: string; scenes: SceneRow[] }) => Promise<void>
  }
  shotsAPI: {
    getAll: () => Promise<ShotRow[]>
    getBySeries: (seriesId: string) => Promise<ShotRow[]>
    insert: (shot: ShotRow) => Promise<void>
    update: (shot: ShotRow) => Promise<void>
    delete: (id: string) => Promise<void>
    replaceBySeries: (payload: { seriesId: string; shots: ShotRow[] }) => Promise<void>
  }
  windowAPI: {
    openStudio: (payload: { projectId: string; seriesId: string }) => Promise<void>
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
