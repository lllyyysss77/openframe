import type { AIConfig } from '@openframe/providers'
import { DEFAULT_AI_CONFIG } from '@openframe/providers'
import { ensureProxyFetchInstalled } from './web_runtime_fetch_proxy'
import { createWebAiApi } from './web_runtime_ai'

const DB_NAME = 'openframe-web'
const DB_VERSION = 1

const STORE_NAMES = {
  genres: 'genres',
  categories: 'categories',
  projects: 'projects',
  series: 'series',
  characters: 'characters',
  characterRelations: 'character_relations',
  props: 'props',
  scenes: 'scenes',
  shots: 'shots',
  seriesSceneLinks: 'series_scene_links',
  seriesCharacterLinks: 'series_character_links',
  seriesPropLinks: 'series_prop_links',
  vectorDocuments: 'vector_documents',
  vectorChunks: 'vector_chunks',
} as const

type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES]

type Identifiable = { id: string | number }

type SeriesSceneLinkRow = {
  id: string
  project_id: string
  series_id: string
  scene_id: string
  created_at: number
}

type SeriesCharacterLinkRow = {
  id: string
  project_id: string
  series_id: string
  character_id: string
  created_at: number
}

type SeriesPropLinkRow = {
  id: string
  project_id: string
  series_id: string
  prop_id: string
  created_at: number
}

type VectorDocumentRow = {
  id: string
  title: string
  type: string
  project_id?: string
  created_at: number
}

type VectorChunkRow = {
  id?: number
  document_id: string
  content: string
  chunk_index: number
  embedding: number[]
  created_at: number
}

const SETTINGS_KEYS = [
  'language',
  'theme',
  'onboarding_seen',
  'onboarding_version',
  'prompt_overrides',
] as const

type AllowedSettingKey = (typeof SETTINGS_KEYS)[number]

const SETTINGS_PREFIX = 'openframe:web:setting:'
const AI_CONFIG_KEY = 'openframe:web:ai_config'
const VECTOR_DIMENSION_KEY = 'openframe:web:vec_dimension'
const DATA_DIR_KEY = 'openframe:web:data_dir'
const DEFAULT_DATA_DIR = 'browser://indexeddb'

let dbPromise: Promise<IDBDatabase> | null = null

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function createStoreIfMissing(
  db: IDBDatabase,
  storeName: StoreName,
  options: IDBObjectStoreParameters,
) {
  if (db.objectStoreNames.contains(storeName)) return
  db.createObjectStore(storeName, options)
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      createStoreIfMissing(db, STORE_NAMES.genres, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.categories, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.projects, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.series, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.characters, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.characterRelations, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.props, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.scenes, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.shots, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.seriesSceneLinks, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.seriesCharacterLinks, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.seriesPropLinks, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.vectorDocuments, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.vectorChunks, { keyPath: 'id', autoIncrement: true })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'))
  })

  return dbPromise
}

async function getAllRows<T extends Identifiable>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const rows = await requestToPromise(transaction.objectStore(storeName).getAll() as IDBRequest<T[]>)
  await transactionToPromise(transaction)
  return rows
}

async function getRowById<T extends Identifiable>(
  storeName: StoreName,
  id: string | number,
): Promise<T | undefined> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const row = await requestToPromise(transaction.objectStore(storeName).get(id) as IDBRequest<T | undefined>)
  await transactionToPromise(transaction)
  return row
}

async function putRow<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  store.put(value)
  await transactionToPromise(transaction)
}

async function addRow<T>(storeName: StoreName, value: T): Promise<IDBValidKey> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  const key = await requestToPromise(store.add(value))
  await transactionToPromise(transaction)
  return key
}

async function deleteRowById(storeName: StoreName, id: string | number): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).delete(id)
  await transactionToPromise(transaction)
}

async function removeRowsWhere<T extends Identifiable>(
  storeName: StoreName,
  predicate: (row: T) => boolean,
): Promise<number> {
  const rows = await getAllRows<T>(storeName)
  const ids = rows.filter(predicate).map((row) => row.id)
  if (ids.length === 0) return 0

  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  ids.forEach((id) => {
    store.delete(id)
  })
  await transactionToPromise(transaction)
  return ids.length
}

function sortByCreatedDesc<T extends { created_at: number }>(left: T, right: T): number {
  return right.created_at - left.created_at
}

function sortByCreatedAsc<T extends { created_at: number }>(left: T, right: T): number {
  return left.created_at - right.created_at
}

function sortSeriesByProjectOrder(left: SeriesRow, right: SeriesRow): number {
  return left.sort_index - right.sort_index || left.created_at - right.created_at
}

function normalizeAge(value: string): CharacterRow['age'] {
  const raw = (value || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (raw === '幼年' || lower === 'child') return 'child'
  if (raw === '少年' || lower === 'youth' || lower === 'teen') return 'youth'
  if (raw === '青年' || lower === 'young_adult' || lower === 'young adult') return 'young_adult'
  if (raw === '成年' || lower === 'adult') return 'adult'
  if (raw === '中年' || lower === 'middle_aged' || lower === 'middle-aged') return 'middle_aged'
  if (raw === '老年' || lower === 'elder') return 'elder'
  return ''
}

function normalizeGender(value: string): CharacterRow['gender'] {
  const raw = (value || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (raw === '男' || lower === 'male') return 'male'
  if (raw === '女' || lower === 'female') return 'female'
  if (raw === '其他' || lower === 'other') return 'other'
  return ''
}

function normalizeCharacterRow(row: CharacterRow): CharacterRow {
  return {
    ...row,
    gender: normalizeGender(row.gender),
    age: normalizeAge(row.age),
  }
}

function buildSceneLinkId(seriesId: string, sceneId: string): string {
  return `${seriesId}::${sceneId}`
}

function buildCharacterLinkId(seriesId: string, characterId: string): string {
  return `${seriesId}::${characterId}`
}

function buildPropLinkId(seriesId: string, propId: string): string {
  return `${seriesId}::${propId}`
}

function getSettingStorageKey(key: AllowedSettingKey): string {
  return `${SETTINGS_PREFIX}${key}`
}

function localGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function localSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore quota/storage errors in fallback runtime
  }
}

function localDelete(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore storage errors in fallback runtime
  }
}

function getStoredSetting(key: AllowedSettingKey): string {
  return localGet(getSettingStorageKey(key)) ?? ''
}

function readJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage errors in fallback runtime
  }
}

function extToMimeType(ext: string, folder?: 'thumbnails' | 'videos'): string {
  const value = ext.replace(/^\./, '').toLowerCase()
  if (folder === 'videos') {
    if (value === 'webm') return 'video/webm'
    if (value === 'mov') return 'video/quicktime'
    if (value === 'm4v') return 'video/x-m4v'
    return 'video/mp4'
  }
  if (value === 'jpg' || value === 'jpeg') return 'image/jpeg'
  if (value === 'webp') return 'image/webp'
  if (value === 'gif') return 'image/gif'
  if (value === 'bmp') return 'image/bmp'
  if (value === 'svg') return 'image/svg+xml'
  if (value === 'avif') return 'image/avif'
  return 'image/png'
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Unable to read blob as data URL'))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Unable to read blob'))
    }
    reader.readAsDataURL(blob)
  })
}

async function toDataUrl(bytes: Uint8Array, mimeType: string): Promise<string> {
  const normalized = new Uint8Array(bytes)
  const blob = new Blob([normalized], { type: mimeType })
  return blobToDataUrl(blob)
}

async function readMediaAsDataUrl(path: string): Promise<string | null> {
  if (!path) return null
  if (/^data:/i.test(path)) return path

  if (/^openframe-thumb:/i.test(path)) {
    try {
      const parsed = new URL(path)
      const rawPath = parsed.searchParams.get('path')
      if (!rawPath) return null
      return readMediaAsDataUrl(decodeURIComponent(rawPath))
    } catch {
      return null
    }
  }

  if (/^(https?:|blob:)/i.test(path)) {
    try {
      const response = await fetch(path)
      if (!response.ok) return null
      const blob = await response.blob()
      return blobToDataUrl(blob)
    } catch {
      return null
    }
  }

  return null
}

function cosineDistance(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return Number.POSITIVE_INFINITY

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    dot += leftValue * rightValue
    leftNorm += leftValue * leftValue
    rightNorm += rightValue * rightValue
  }

  if (leftNorm === 0 || rightNorm === 0) return Number.POSITIVE_INFINITY
  const cosine = dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
  return 1 - cosine
}

function estimateTextBytes(value: string): number {
  return new Blob([value]).size
}

function maybeDataUrlSize(value: string | null | undefined): number {
  if (!value || !/^data:/i.test(value)) return 0
  return estimateTextBytes(value)
}

async function syncProjectSeriesCount(projectId: string): Promise<void> {
  const [project, allSeries] = await Promise.all([
    getRowById<ProjectRow>(STORE_NAMES.projects, projectId),
    getAllRows<SeriesRow>(STORE_NAMES.series),
  ])
  if (!project) return
  const seriesCount = allSeries.filter((series) => series.project_id === projectId).length
  await putRow(STORE_NAMES.projects, {
    ...project,
    series_count: seriesCount,
  })
}

async function getDataInfo(): Promise<DataInfo> {
  const [
    genres,
    projects,
    series,
    characters,
    characterRelations,
    props,
    scenes,
    shots,
    sceneLinks,
    characterLinks,
    propLinks,
    vectorDocuments,
    vectorChunks,
  ] = await Promise.all([
    getAllRows<GenreRow>(STORE_NAMES.genres),
    getAllRows<ProjectRow>(STORE_NAMES.projects),
    getAllRows<SeriesRow>(STORE_NAMES.series),
    getAllRows<CharacterRow>(STORE_NAMES.characters),
    getAllRows<CharacterRelationRow>(STORE_NAMES.characterRelations),
    getAllRows<PropRow>(STORE_NAMES.props),
    getAllRows<SceneRow>(STORE_NAMES.scenes),
    getAllRows<ShotRow>(STORE_NAMES.shots),
    getAllRows<SeriesSceneLinkRow>(STORE_NAMES.seriesSceneLinks),
    getAllRows<SeriesCharacterLinkRow>(STORE_NAMES.seriesCharacterLinks),
    getAllRows<SeriesPropLinkRow>(STORE_NAMES.seriesPropLinks),
    getAllRows<VectorDocumentRow>(STORE_NAMES.vectorDocuments),
    getAllRows<VectorChunkRow & Identifiable>(STORE_NAMES.vectorChunks),
  ])

  let thumbsSize = 0
  let videosSize = 0

  const addThumb = (value: string | null | undefined) => {
    thumbsSize += maybeDataUrlSize(value)
  }
  const addVideo = (value: string | null | undefined) => {
    videosSize += maybeDataUrlSize(value)
  }

  genres.forEach((row) => addThumb(row.thumbnail))
  projects.forEach((row) => addThumb(row.thumbnail))
  series.forEach((row) => addThumb(row.thumbnail))
  characters.forEach((row) => addThumb(row.thumbnail))
  props.forEach((row) => addThumb(row.thumbnail))
  scenes.forEach((row) => addThumb(row.thumbnail))
  shots.forEach((row) => {
    addThumb(row.thumbnail)
    addThumb(row.production_first_frame)
    addThumb(row.production_last_frame)
    addVideo(row.production_video)
  })

  const dbSize = [
    ...genres,
    ...projects,
    ...series,
    ...characters,
    ...characterRelations,
    ...props,
    ...scenes,
    ...shots,
    ...sceneLinks,
    ...characterLinks,
    ...propLinks,
    ...vectorDocuments,
    ...vectorChunks,
  ].reduce((total, row) => total + estimateTextBytes(JSON.stringify(row)), 0)

  const currentDir = localGet(DATA_DIR_KEY) || DEFAULT_DATA_DIR

  return {
    defaultDir: DEFAULT_DATA_DIR,
    currentDir,
    pendingDir: currentDir,
    dbSize,
    thumbsSize,
    videosSize,
  }
}

function getCurrentAIConfig(): AIConfig {
  return readJSON(localGet(AI_CONFIG_KEY), DEFAULT_AI_CONFIG)
}

function saveCurrentAIConfig(config: unknown): void {
  writeJSON(AI_CONFIG_KEY, config)
}

export function ensureWebRuntimeAPIs(): void {
  const runtimeWindow = window as Window

  if (runtimeWindow.settingsAPI && runtimeWindow.projectsAPI) return
  ensureProxyFetchInstalled()

  const ipcRendererShim = {
    on: () => ipcRendererShim as unknown as Window['ipcRenderer'],
    off: () => ipcRendererShim as unknown as Window['ipcRenderer'],
    send: () => undefined,
    invoke: async () => {
      throw new Error('IPC is unavailable in web runtime')
    },
    removeListener: () => ipcRendererShim as unknown as Window['ipcRenderer'],
  } as unknown as Window['ipcRenderer']

  runtimeWindow.ipcRenderer = ipcRendererShim

  runtimeWindow.sqlite = {
    query: async () => {
      throw new Error('SQLite query API is unavailable in web runtime')
    },
    select: async () => {
      throw new Error('SQLite select API is unavailable in web runtime')
    },
  }

  runtimeWindow.settingsAPI = {
    getAll: async () =>
      SETTINGS_KEYS.map((key) => ({
        key,
        value: getStoredSetting(key),
      })),
    upsert: async (key: string, value: string) => {
      if (!SETTINGS_KEYS.includes(key as AllowedSettingKey)) return
      localSet(getSettingStorageKey(key as AllowedSettingKey), value)
    },
    delete: async (key: string) => {
      if (!SETTINGS_KEYS.includes(key as AllowedSettingKey)) return
      localDelete(getSettingStorageKey(key as AllowedSettingKey))
    },
  }

  runtimeWindow.thumbnailsAPI = {
    save: async (data: Uint8Array, ext: string, folder?: 'thumbnails' | 'videos') => {
      const mimeType = extToMimeType(ext, folder)
      return toDataUrl(data, mimeType)
    },
    delete: async () => {
      // data URLs are embedded in records; no separate file cleanup required
    },
    readBase64: async (filepath: string) => readMediaAsDataUrl(filepath),
  }

  runtimeWindow.genresAPI = {
    getAll: async () => {
      const rows = await getAllRows<GenreRow>(STORE_NAMES.genres)
      return rows.sort(sortByCreatedDesc)
    },
    insert: async (genre: GenreRow) => {
      await putRow(STORE_NAMES.genres, genre)
    },
    update: async (genre: GenreRow) => {
      await putRow(STORE_NAMES.genres, genre)
    },
    delete: async (id: string) => {
      await deleteRowById(STORE_NAMES.genres, id)
    },
  }

  runtimeWindow.categoriesAPI = {
    getAll: async () => {
      const rows = await getAllRows<CategoryRow>(STORE_NAMES.categories)
      return rows.sort(sortByCreatedDesc)
    },
    insert: async (category: CategoryRow) => {
      await putRow(STORE_NAMES.categories, category)
    },
    update: async (category: CategoryRow) => {
      await putRow(STORE_NAMES.categories, category)
    },
    delete: async (id: string) => {
      await deleteRowById(STORE_NAMES.categories, id)
    },
  }

  runtimeWindow.projectsAPI = {
    getAll: async () => {
      const rows = await getAllRows<ProjectRow>(STORE_NAMES.projects)
      return rows.sort(sortByCreatedDesc)
    },
    insert: async (project: ProjectRow) => {
      await putRow(STORE_NAMES.projects, project)
    },
    update: async (project: ProjectRow) => {
      await putRow(STORE_NAMES.projects, project)
    },
    delete: async (id: string) => {
      const [seriesRows, sceneRows] = await Promise.all([
        getAllRows<SeriesRow>(STORE_NAMES.series),
        getAllRows<SceneRow>(STORE_NAMES.scenes),
      ])
      const seriesIds = new Set(
        seriesRows.filter((row) => row.project_id === id).map((row) => row.id),
      )
      const sceneIds = new Set(
        sceneRows.filter((row) => row.project_id === id).map((row) => row.id),
      )

      await Promise.all([
        removeRowsWhere<SeriesSceneLinkRow>(
          STORE_NAMES.seriesSceneLinks,
          (row) => row.project_id === id,
        ),
        removeRowsWhere<SeriesCharacterLinkRow>(
          STORE_NAMES.seriesCharacterLinks,
          (row) => row.project_id === id,
        ),
        removeRowsWhere<SeriesPropLinkRow>(
          STORE_NAMES.seriesPropLinks,
          (row) => row.project_id === id,
        ),
        removeRowsWhere<CharacterRow>(STORE_NAMES.characters, (row) => row.project_id === id),
        removeRowsWhere<CharacterRelationRow>(
          STORE_NAMES.characterRelations,
          (row) => row.project_id === id,
        ),
        removeRowsWhere<PropRow>(STORE_NAMES.props, (row) => row.project_id === id),
        removeRowsWhere<ShotRow>(
          STORE_NAMES.shots,
          (row) => sceneIds.has(row.scene_id) || seriesIds.has(row.series_id),
        ),
        removeRowsWhere<SceneRow>(STORE_NAMES.scenes, (row) => row.project_id === id),
        removeRowsWhere<SeriesRow>(STORE_NAMES.series, (row) => row.project_id === id),
      ])
      await deleteRowById(STORE_NAMES.projects, id)
    },
  }

  runtimeWindow.seriesAPI = {
    getAll: async () => {
      const rows = await getAllRows<SeriesRow>(STORE_NAMES.series)
      return rows.sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<SeriesRow>(STORE_NAMES.series)
      return rows
        .filter((row) => row.project_id === projectId)
        .sort(sortSeriesByProjectOrder)
    },
    insert: async (series: SeriesRow) => {
      await putRow(STORE_NAMES.series, series)
      await syncProjectSeriesCount(series.project_id)
    },
    update: async (series: SeriesRow) => {
      await putRow(STORE_NAMES.series, series)
    },
    delete: async (id: string) => {
      const row = await getRowById<SeriesRow>(STORE_NAMES.series, id)
      await Promise.all([
        removeRowsWhere<ShotRow>(STORE_NAMES.shots, (shot) => shot.series_id === id),
        removeRowsWhere<SeriesSceneLinkRow>(
          STORE_NAMES.seriesSceneLinks,
          (link) => link.series_id === id,
        ),
        removeRowsWhere<SeriesCharacterLinkRow>(
          STORE_NAMES.seriesCharacterLinks,
          (link) => link.series_id === id,
        ),
        removeRowsWhere<SeriesPropLinkRow>(
          STORE_NAMES.seriesPropLinks,
          (link) => link.series_id === id,
        ),
      ])
      await deleteRowById(STORE_NAMES.series, id)
      if (row) {
        await syncProjectSeriesCount(row.project_id)
      }
    },
  }

  runtimeWindow.charactersAPI = {
    getAll: async () => {
      const rows = await getAllRows<CharacterRow>(STORE_NAMES.characters)
      return rows.map(normalizeCharacterRow).sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<CharacterRow>(STORE_NAMES.characters)
      return rows
        .filter((row) => row.project_id === projectId)
        .map(normalizeCharacterRow)
        .sort(sortByCreatedAsc)
    },
    getBySeries: async (seriesId: string) => {
      const [rows, links] = await Promise.all([
        getAllRows<CharacterRow>(STORE_NAMES.characters),
        getAllRows<SeriesCharacterLinkRow>(STORE_NAMES.seriesCharacterLinks),
      ])
      const linkedIds = new Set(
        links
          .filter((link) => link.series_id === seriesId)
          .map((link) => link.character_id),
      )
      return rows
        .filter((row) => linkedIds.has(row.id))
        .map(normalizeCharacterRow)
        .sort(sortByCreatedAsc)
    },
    insert: async (character: CharacterRow) => {
      await putRow(STORE_NAMES.characters, normalizeCharacterRow(character))
    },
    update: async (character: CharacterRow) => {
      await putRow(STORE_NAMES.characters, normalizeCharacterRow(character))
    },
    delete: async (id: string) => {
      await Promise.all([
        removeRowsWhere<SeriesCharacterLinkRow>(
          STORE_NAMES.seriesCharacterLinks,
          (row) => row.character_id === id,
        ),
        deleteRowById(STORE_NAMES.characters, id),
      ])
    },
    replaceByProject: async (payload: { projectId: string; characters: CharacterRow[] }) => {
      await Promise.all([
        removeRowsWhere<SeriesCharacterLinkRow>(
          STORE_NAMES.seriesCharacterLinks,
          (row) => row.project_id === payload.projectId,
        ),
        removeRowsWhere<CharacterRow>(
          STORE_NAMES.characters,
          (row) => row.project_id === payload.projectId,
        ),
      ])
      await Promise.all(payload.characters.map((character) =>
        putRow(STORE_NAMES.characters, normalizeCharacterRow({
          ...character,
          project_id: payload.projectId,
        })),
      ))
    },
    replaceBySeries: async (payload: {
      projectId: string
      seriesId: string
      characters: CharacterRow[]
    }) => {
      await Promise.all(payload.characters.map((character) =>
        putRow(STORE_NAMES.characters, normalizeCharacterRow({
          ...character,
          project_id: payload.projectId,
        })),
      ))

      await removeRowsWhere<SeriesCharacterLinkRow>(
        STORE_NAMES.seriesCharacterLinks,
        (row) => row.project_id === payload.projectId && row.series_id === payload.seriesId,
      )
      const now = Date.now()
      await Promise.all(payload.characters.map((character) =>
        putRow(STORE_NAMES.seriesCharacterLinks, {
          id: buildCharacterLinkId(payload.seriesId, character.id),
          project_id: payload.projectId,
          series_id: payload.seriesId,
          character_id: character.id,
          created_at: now,
        } satisfies SeriesCharacterLinkRow),
      ))
    },
    linkToSeries: async (payload: {
      project_id: string
      series_id: string
      character_id: string
      created_at: number
    }) => {
      await putRow(STORE_NAMES.seriesCharacterLinks, {
        id: buildCharacterLinkId(payload.series_id, payload.character_id),
        project_id: payload.project_id,
        series_id: payload.series_id,
        character_id: payload.character_id,
        created_at: payload.created_at,
      } satisfies SeriesCharacterLinkRow)
    },
    unlinkFromSeries: async (payload: { seriesId: string; characterId: string }) => {
      await deleteRowById(
        STORE_NAMES.seriesCharacterLinks,
        buildCharacterLinkId(payload.seriesId, payload.characterId),
      )
    },
  }

  runtimeWindow.characterRelationsAPI = {
    getAll: async () => {
      const rows = await getAllRows<CharacterRelationRow>(STORE_NAMES.characterRelations)
      return rows.sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<CharacterRelationRow>(STORE_NAMES.characterRelations)
      return rows
        .filter((row) => row.project_id === projectId)
        .sort(sortByCreatedAsc)
    },
    insert: async (row: CharacterRelationRow) => {
      await putRow(STORE_NAMES.characterRelations, row)
    },
    update: async (row: CharacterRelationRow) => {
      await putRow(STORE_NAMES.characterRelations, row)
    },
    delete: async (id: string) => {
      await deleteRowById(STORE_NAMES.characterRelations, id)
    },
    replaceByProject: async (payload: {
      projectId: string
      relations: CharacterRelationRow[]
    }) => {
      await removeRowsWhere<CharacterRelationRow>(
        STORE_NAMES.characterRelations,
        (row) => row.project_id === payload.projectId,
      )
      await Promise.all(payload.relations.map((row) =>
        putRow(STORE_NAMES.characterRelations, {
          ...row,
          project_id: payload.projectId,
        }),
      ))
    },
  }

  runtimeWindow.propsAPI = {
    getAll: async () => {
      const rows = await getAllRows<PropRow>(STORE_NAMES.props)
      return rows.sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<PropRow>(STORE_NAMES.props)
      return rows
        .filter((row) => row.project_id === projectId)
        .sort(sortByCreatedAsc)
    },
    getBySeries: async (seriesId: string) => {
      const [rows, links] = await Promise.all([
        getAllRows<PropRow>(STORE_NAMES.props),
        getAllRows<SeriesPropLinkRow>(STORE_NAMES.seriesPropLinks),
      ])
      const linkedIds = new Set(
        links
          .filter((link) => link.series_id === seriesId)
          .map((link) => link.prop_id),
      )
      return rows
        .filter((row) => linkedIds.has(row.id))
        .sort(sortByCreatedAsc)
    },
    insert: async (prop: PropRow) => {
      await putRow(STORE_NAMES.props, prop)
    },
    update: async (prop: PropRow) => {
      await putRow(STORE_NAMES.props, prop)
    },
    delete: async (id: string) => {
      await Promise.all([
        removeRowsWhere<SeriesPropLinkRow>(
          STORE_NAMES.seriesPropLinks,
          (row) => row.prop_id === id,
        ),
        deleteRowById(STORE_NAMES.props, id),
      ])
    },
    replaceByProject: async (payload: { projectId: string; props: PropRow[] }) => {
      await Promise.all([
        removeRowsWhere<SeriesPropLinkRow>(
          STORE_NAMES.seriesPropLinks,
          (row) => row.project_id === payload.projectId,
        ),
        removeRowsWhere<PropRow>(
          STORE_NAMES.props,
          (row) => row.project_id === payload.projectId,
        ),
      ])
      await Promise.all(payload.props.map((prop) =>
        putRow(STORE_NAMES.props, {
          ...prop,
          project_id: payload.projectId,
        }),
      ))
    },
    replaceBySeries: async (payload: {
      projectId: string
      seriesId: string
      props: PropRow[]
    }) => {
      await Promise.all(payload.props.map((prop) =>
        putRow(STORE_NAMES.props, {
          ...prop,
          project_id: payload.projectId,
        }),
      ))

      await removeRowsWhere<SeriesPropLinkRow>(
        STORE_NAMES.seriesPropLinks,
        (row) => row.project_id === payload.projectId && row.series_id === payload.seriesId,
      )
      const now = Date.now()
      await Promise.all(payload.props.map((prop) =>
        putRow(STORE_NAMES.seriesPropLinks, {
          id: buildPropLinkId(payload.seriesId, prop.id),
          project_id: payload.projectId,
          series_id: payload.seriesId,
          prop_id: prop.id,
          created_at: now,
        } satisfies SeriesPropLinkRow),
      ))
    },
    linkToSeries: async (payload: {
      project_id: string
      series_id: string
      prop_id: string
      created_at: number
    }) => {
      await putRow(STORE_NAMES.seriesPropLinks, {
        id: buildPropLinkId(payload.series_id, payload.prop_id),
        project_id: payload.project_id,
        series_id: payload.series_id,
        prop_id: payload.prop_id,
        created_at: payload.created_at,
      } satisfies SeriesPropLinkRow)
    },
    unlinkFromSeries: async (payload: { seriesId: string; propId: string }) => {
      await deleteRowById(
        STORE_NAMES.seriesPropLinks,
        buildPropLinkId(payload.seriesId, payload.propId),
      )
    },
  }

  runtimeWindow.scenesAPI = {
    getAll: async () => {
      const rows = await getAllRows<SceneRow>(STORE_NAMES.scenes)
      return rows.sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<SceneRow>(STORE_NAMES.scenes)
      return rows
        .filter((row) => row.project_id === projectId)
        .sort(sortByCreatedAsc)
    },
    getBySeries: async (seriesId: string) => {
      const [rows, links] = await Promise.all([
        getAllRows<SceneRow>(STORE_NAMES.scenes),
        getAllRows<SeriesSceneLinkRow>(STORE_NAMES.seriesSceneLinks),
      ])
      const linkedIds = new Set(
        links
          .filter((link) => link.series_id === seriesId)
          .map((link) => link.scene_id),
      )
      return rows
        .filter((row) => linkedIds.has(row.id))
        .sort(sortByCreatedAsc)
    },
    insert: async (scene: SceneRow) => {
      await putRow(STORE_NAMES.scenes, scene)
    },
    update: async (scene: SceneRow) => {
      await putRow(STORE_NAMES.scenes, scene)
    },
    delete: async (id: string) => {
      await Promise.all([
        removeRowsWhere<SeriesSceneLinkRow>(
          STORE_NAMES.seriesSceneLinks,
          (row) => row.scene_id === id,
        ),
        removeRowsWhere<ShotRow>(STORE_NAMES.shots, (row) => row.scene_id === id),
        deleteRowById(STORE_NAMES.scenes, id),
      ])
    },
    replaceByProject: async (payload: { projectId: string; scenes: SceneRow[] }) => {
      const scenesToDelete = await getAllRows<SceneRow>(STORE_NAMES.scenes)
      const sceneIds = new Set(
        scenesToDelete
          .filter((row) => row.project_id === payload.projectId)
          .map((row) => row.id),
      )

      await Promise.all([
        removeRowsWhere<SeriesSceneLinkRow>(
          STORE_NAMES.seriesSceneLinks,
          (row) => row.project_id === payload.projectId,
        ),
        removeRowsWhere<ShotRow>(STORE_NAMES.shots, (row) => sceneIds.has(row.scene_id)),
        removeRowsWhere<SceneRow>(STORE_NAMES.scenes, (row) => row.project_id === payload.projectId),
      ])

      await Promise.all(payload.scenes.map((scene) =>
        putRow(STORE_NAMES.scenes, {
          ...scene,
          project_id: payload.projectId,
        }),
      ))
    },
    replaceBySeries: async (payload: {
      projectId: string
      seriesId: string
      scenes: SceneRow[]
    }) => {
      await Promise.all(payload.scenes.map((scene) =>
        putRow(STORE_NAMES.scenes, {
          ...scene,
          project_id: payload.projectId,
        }),
      ))

      await removeRowsWhere<SeriesSceneLinkRow>(
        STORE_NAMES.seriesSceneLinks,
        (row) => row.project_id === payload.projectId && row.series_id === payload.seriesId,
      )
      const now = Date.now()
      await Promise.all(payload.scenes.map((scene) =>
        putRow(STORE_NAMES.seriesSceneLinks, {
          id: buildSceneLinkId(payload.seriesId, scene.id),
          project_id: payload.projectId,
          series_id: payload.seriesId,
          scene_id: scene.id,
          created_at: now,
        } satisfies SeriesSceneLinkRow),
      ))

      const allowedSceneIds = new Set(payload.scenes.map((scene) => scene.id))
      await removeRowsWhere<ShotRow>(
        STORE_NAMES.shots,
        (shot) => shot.series_id === payload.seriesId && !allowedSceneIds.has(shot.scene_id),
      )
    },
    linkToSeries: async (payload: {
      project_id: string
      series_id: string
      scene_id: string
      created_at: number
    }) => {
      await putRow(STORE_NAMES.seriesSceneLinks, {
        id: buildSceneLinkId(payload.series_id, payload.scene_id),
        project_id: payload.project_id,
        series_id: payload.series_id,
        scene_id: payload.scene_id,
        created_at: payload.created_at,
      } satisfies SeriesSceneLinkRow)
    },
    unlinkFromSeries: async (payload: { seriesId: string; sceneId: string }) => {
      await Promise.all([
        deleteRowById(
          STORE_NAMES.seriesSceneLinks,
          buildSceneLinkId(payload.seriesId, payload.sceneId),
        ),
        removeRowsWhere<ShotRow>(
          STORE_NAMES.shots,
          (row) => row.series_id === payload.seriesId && row.scene_id === payload.sceneId,
        ),
      ])
    },
  }

  runtimeWindow.shotsAPI = {
    getAll: async () => {
      const rows = await getAllRows<ShotRow>(STORE_NAMES.shots)
      return rows.sort(sortByCreatedDesc)
    },
    getBySeries: async (seriesId: string) => {
      const rows = await getAllRows<ShotRow>(STORE_NAMES.shots)
      return rows
        .filter((row) => row.series_id === seriesId)
        .sort((left, right) => left.shot_index - right.shot_index || left.created_at - right.created_at)
    },
    insert: async (shot: ShotRow) => {
      await putRow(STORE_NAMES.shots, shot)
    },
    update: async (shot: ShotRow) => {
      await putRow(STORE_NAMES.shots, shot)
    },
    delete: async (id: string) => {
      await deleteRowById(STORE_NAMES.shots, id)
    },
    replaceBySeries: async (payload: { seriesId: string; shots: ShotRow[] }) => {
      await removeRowsWhere<ShotRow>(
        STORE_NAMES.shots,
        (row) => row.series_id === payload.seriesId,
      )
      await Promise.all(payload.shots.map((shot) =>
        putRow(STORE_NAMES.shots, {
          ...shot,
          series_id: payload.seriesId,
        }),
      ))

      const series = await getRowById<SeriesRow>(STORE_NAMES.series, payload.seriesId)
      if (!series) return

      const now = Date.now()
      for (const shot of payload.shots) {
        await putRow(STORE_NAMES.seriesSceneLinks, {
          id: buildSceneLinkId(payload.seriesId, shot.scene_id),
          project_id: series.project_id,
          series_id: payload.seriesId,
          scene_id: shot.scene_id,
          created_at: now,
        } satisfies SeriesSceneLinkRow)

        for (const characterId of shot.character_ids) {
          await putRow(STORE_NAMES.seriesCharacterLinks, {
            id: buildCharacterLinkId(payload.seriesId, characterId),
            project_id: series.project_id,
            series_id: payload.seriesId,
            character_id: characterId,
            created_at: now,
          } satisfies SeriesCharacterLinkRow)
        }

        for (const propId of shot.prop_ids) {
          await putRow(STORE_NAMES.seriesPropLinks, {
            id: buildPropLinkId(payload.seriesId, propId),
            project_id: series.project_id,
            series_id: payload.seriesId,
            prop_id: propId,
            created_at: now,
          } satisfies SeriesPropLinkRow)
        }
      }
    },
  }

  runtimeWindow.windowAPI = {
    openStudio: async (payload: { projectId: string; seriesId: string }) => {
      const nextHash = `#/projects/${encodeURIComponent(payload.projectId)}?studio=1&seriesId=${encodeURIComponent(payload.seriesId)}`
      window.location.hash = nextHash
    },
  }

  runtimeWindow.mediaAPI = {
    autoEdit: async (payload) => {
      const first = payload.clips[0]?.path
      if (!first) throw new Error('No clip available for auto edit')
      return { outputPath: first }
    },
    exportMergedVideo: async (payload) => {
      const first = payload.clips[0]?.path
      if (!first) return { canceled: true }
      return { outputPath: first }
    },
    exportFcpxml: async () => ({ canceled: true }),
    exportEdl: async () => ({ canceled: true }),
  }

  runtimeWindow.aiAPI = createWebAiApi({
    getCurrentAIConfig,
    saveAIConfig: saveCurrentAIConfig,
  })

  runtimeWindow.vectorsAPI = {
    getDimension: async () => {
      const value = Number(localGet(VECTOR_DIMENSION_KEY) || '0')
      return Number.isFinite(value) ? value : 0
    },
    insertDocument: async (doc: { id: string; title: string; type: string; project_id?: string }) => {
      await putRow(STORE_NAMES.vectorDocuments, {
        ...doc,
        created_at: Math.floor(Date.now() / 1000),
      } satisfies VectorDocumentRow)
    },
    insertChunk: async (chunk: {
      document_id: string
      content: string
      chunk_index: number
      embedding: number[]
    }) => {
      const key = await addRow(STORE_NAMES.vectorChunks, {
        document_id: chunk.document_id,
        content: chunk.content,
        chunk_index: chunk.chunk_index,
        embedding: chunk.embedding,
        created_at: Math.floor(Date.now() / 1000),
      } satisfies VectorChunkRow)

      localSet(VECTOR_DIMENSION_KEY, String(chunk.embedding.length))

      if (typeof key === 'number') return key
      return Number(key)
    },
    search: async (params: { embedding: number[]; limit?: number; document_id?: string }) => {
      const rows = await getAllRows<(VectorChunkRow & Identifiable)>(STORE_NAMES.vectorChunks)
      const filtered = params.document_id
        ? rows.filter((row) => row.document_id === params.document_id)
        : rows

      const scored = filtered
        .map((row) => ({
          chunk_id: Number(row.id),
          document_id: row.document_id,
          content: row.content,
          chunk_index: row.chunk_index,
          distance: cosineDistance(params.embedding, row.embedding),
        }))
        .filter((row) => Number.isFinite(row.distance))
        .sort((left, right) => left.distance - right.distance)

      const limit = Math.max(1, params.limit ?? 5)
      return scored.slice(0, limit)
    },
    deleteDocument: async (documentId: string) => {
      await Promise.all([
        deleteRowById(STORE_NAMES.vectorDocuments, documentId),
        removeRowsWhere<(VectorChunkRow & Identifiable)>(
          STORE_NAMES.vectorChunks,
          (row) => row.document_id === documentId,
        ),
      ])
    },
  }

  runtimeWindow.dataAPI = {
    getInfo: async () => getDataInfo(),
    cleanupUnusedMedia: async () => ({
      removedImages: 0,
      removedVideos: 0,
      freedBytes: 0,
    }),
    selectDirectory: async () => null,
    setDirectory: async (dir: string) => {
      localSet(DATA_DIR_KEY, dir || DEFAULT_DATA_DIR)
    },
    resetDirectory: async () => {
      localDelete(DATA_DIR_KEY)
    },
    openDirectory: async () => undefined,
    restart: async () => {
      window.location.reload()
    },
  }
}
