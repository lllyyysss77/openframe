import type { AIConfig } from '@openframe/providers'
import { DEFAULT_AI_CONFIG } from '@openframe/providers'
import {
  isObjectStorageEnabled,
  parseObjectStorageConfig,
  type ObjectStorageConfig,
} from '@openframe/shared/object-storage-config'
import { ensureProxyFetchInstalled } from './web_runtime_fetch_proxy'
import { createWebAiApi } from './web_runtime_ai'

const DB_NAME = 'openframe-web'
const DB_VERSION = 3

const STORE_NAMES = {
  genres: 'genres',
  categories: 'categories',
  projects: 'projects',
  series: 'series',
  characters: 'characters',
  characterRelations: 'character_relations',
  props: 'props',
  costumes: 'costumes',
  scenes: 'scenes',
  shots: 'shots',
  seriesSceneLinks: 'series_scene_links',
  seriesCharacterLinks: 'series_character_links',
  seriesPropLinks: 'series_prop_links',
  seriesCostumeLinks: 'series_costume_links',
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

type SeriesCostumeLinkRow = {
  id: string
  project_id: string
  series_id: string
  costume_id: string
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

type MediaClip = {
  shotId: string
  path: string
  title?: string
  trimStartSec?: number
  trimEndSec?: number
}

type TimelineExportPayload = {
  orderedShotIds: string[]
  clips: MediaClip[]
}

type ExportMergedVideoPayload = TimelineExportPayload & {
  ratio: '16:9' | '9:16'
}

type ExportFcpxmlPayload = TimelineExportPayload & {
  ratio: '16:9' | '9:16'
  projectName?: string
}

type ExportEdlPayload = TimelineExportPayload & {
  projectName?: string
  fps?: number
}

const SETTINGS_KEYS = [
  'language',
  'theme',
  'onboarding_seen',
  'onboarding_version',
  'update_dismissed_version',
  'prompt_overrides',
  'storage_config',
] as const

type AllowedSettingKey = (typeof SETTINGS_KEYS)[number]

const SETTINGS_PREFIX = 'openframe:web:setting:'
const AI_CONFIG_KEY = 'openframe:web:ai_config'
const VECTOR_DIMENSION_KEY = 'openframe:web:vec_dimension'
const DATA_DIR_KEY = 'openframe:web:data_dir'
const DEFAULT_DATA_DIR = 'browser://indexeddb'
const WEB_APP_VERSION = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_APP_VERSION || '0.0.0').trim()
const WEB_VERSION_MANIFEST_PATH = '/version.json'

let resolvedWebVersion: string | null = null
let resolvingWebVersionPromise: Promise<string> | null = null

function normalizeVersionText(value: string): string {
  const normalized = (value || '').trim().replace(/^v/i, '')
  return normalized || '0.0.0'
}

async function resolveWebAppVersion(): Promise<string> {
  if (resolvedWebVersion) return resolvedWebVersion
  if (resolvingWebVersionPromise) return resolvingWebVersionPromise

  resolvingWebVersionPromise = (async () => {
    try {
      const response = await fetch(WEB_VERSION_MANIFEST_PATH, {
        cache: 'no-store',
        headers: {
          accept: 'application/json',
        },
      })
      if (!response.ok) {
        throw new Error(`Version source fetch failed: ${response.status}`)
      }
      const parsed = await response.json() as { version?: string }
      const manifestVersion = normalizeVersionText(parsed.version || '')
      resolvedWebVersion = manifestVersion
      return manifestVersion
    } catch {
      const fallbackVersion = normalizeVersionText(WEB_APP_VERSION || '0.0.0')
      resolvedWebVersion = fallbackVersion
      return fallbackVersion
    }
  })()

  try {
    return await resolvingWebVersionPromise
  } finally {
    resolvingWebVersionPromise = null
  }
}

let dbPromise: Promise<IDBDatabase> | null = null
let mergedVideoPreviewUrl: string | null = null

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
      createStoreIfMissing(db, STORE_NAMES.costumes, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.scenes, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.shots, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.seriesSceneLinks, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.seriesCharacterLinks, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.seriesPropLinks, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.seriesCostumeLinks, { keyPath: 'id' })
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

function normalizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return Array.from(new Set(ids.map((value) => (typeof value === 'string' ? value : '')).filter(Boolean)))
}

function normalizeCostumeRow(row: CostumeRow): CostumeRow {
  return {
    ...row,
    character_ids: normalizeIds(row.character_ids),
  }
}

function normalizeShotRow(row: ShotRow): ShotRow {
  return {
    ...row,
    character_ids: normalizeIds(row.character_ids),
    prop_ids: normalizeIds(row.prop_ids),
    costume_ids: normalizeIds((row as Partial<ShotRow>).costume_ids),
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

function buildCostumeLinkId(seriesId: string, costumeId: string): string {
  return `${seriesId}::${costumeId}`
}

function escapeXml(value: string): string {
  return value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&apos;')
}

function secToFcpxTime(seconds: number, fps = 30): string {
  const frames = Math.max(1, Math.round(seconds * fps))
  return `${String(frames)}/${String(fps)}s`
}

function formatResourceByRatio(
  ratio: '16:9' | '9:16',
): { width: number; height: number; formatName: string } {
  if (ratio === '9:16') {
    return {
      width: 1080,
      height: 1920,
      formatName: 'FFVideoFormatVertical1080x1920p30',
    }
  }
  return {
    width: 1920,
    height: 1080,
    formatName: 'FFVideoFormat1080p30',
  }
}

function sanitizeReelName(value: string): string {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (!normalized) return 'OPENFRM'
  return normalized.slice(0, 8)
}

function framesToTimecode(totalFrames: number, fps: number): string {
  const safeFrames = Math.max(0, Math.floor(totalFrames))
  const frames = safeFrames % fps
  const totalSeconds = Math.floor(safeFrames / fps)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  const pad2 = (value: number) => String(value).padStart(2, '0')
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}:${pad2(frames)}`
}

function getBasename(pathLike: string): string {
  const normalized = (pathLike || '')
    .split('?')[0]
    .split('#')[0]
  const parts = normalized.split(/[\\/]/)
  return parts[parts.length - 1] || ''
}

function getBasenameWithoutExt(pathLike: string): string {
  const basename = getBasename(pathLike)
  const extIndex = basename.lastIndexOf('.')
  if (extIndex <= 0) return basename
  return basename.slice(0, extIndex)
}

function pickExportClips(payload: TimelineExportPayload): MediaClip[] {
  const clipByShotId = new Map(payload.clips.map((clip) => [clip.shotId, clip]))
  const orderedClips = payload.orderedShotIds
    .map((shotId) => clipByShotId.get(shotId))
    .filter(Boolean) as MediaClip[]

  return orderedClips.length > 0 ? orderedClips : payload.clips
}

type ZipEntry = {
  name: string
  data: Uint8Array
  modifiedAt?: Date
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      if ((value & 1) === 1) {
        value = (value >>> 1) ^ 0xEDB88320
      } else {
        value >>>= 1
      }
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function toDosDateTime(value: Date): { time: number; date: number } {
  const year = Math.max(1980, value.getFullYear())
  const month = value.getMonth() + 1
  const day = value.getDate()
  const hours = value.getHours()
  const minutes = value.getMinutes()
  const seconds = Math.floor(value.getSeconds() / 2)

  const time = ((hours & 0x1F) << 11) | ((minutes & 0x3F) << 5) | (seconds & 0x1F)
  const date = (((year - 1980) & 0x7F) << 9) | ((month & 0x0F) << 5) | (day & 0x1F)
  return { time, date }
}

function sanitizeZipPathSegment(value: string): string {
  const normalized = (value || '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || 'file'
}

function normalizeZipEntryName(value: string): string {
  const normalized = (value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  const parts = normalized
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .map((part) => sanitizeZipPathSegment(part))
  return parts.join('/') || 'file'
}

function buildMediaZipEntryName(pathLike: string, index: number): string {
  const basename = getBasename(pathLike)
  const extIndex = basename.lastIndexOf('.')
  const ext = extIndex > 0
    ? basename.slice(extIndex).replace(/[^A-Za-z0-9.]/g, '') || '.mp4'
    : '.mp4'
  const stem = sanitizeZipPathSegment(
    extIndex > 0 ? basename.slice(0, extIndex) : basename,
  )
  return `media/${String(index).padStart(3, '0')}_${stem}${ext}`
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(output).set(bytes)
  return output
}

function buildZipBytes(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const normalizedName = normalizeZipEntryName(entry.name)
    const nameBytes = encoder.encode(normalizedName)
    const content = new Uint8Array(entry.data)
    const crc = crc32(content)
    const dos = toDosDateTime(entry.modifiedAt ?? new Date())

    const localHeader = new Uint8Array(30)
    const localView = new DataView(localHeader.buffer)
    localView.setUint32(0, 0x04034B50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, dos.time, true)
    localView.setUint16(12, dos.date, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, content.length, true)
    localView.setUint32(22, content.length, true)
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true)
    localParts.push(localHeader, nameBytes, content)

    const centralHeader = new Uint8Array(46)
    const centralView = new DataView(centralHeader.buffer)
    centralView.setUint32(0, 0x02014B50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, dos.time, true)
    centralView.setUint16(14, dos.date, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, content.length, true)
    centralView.setUint32(24, content.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, offset, true)
    centralParts.push(centralHeader, nameBytes)

    offset += localHeader.length + nameBytes.length + content.length
  }

  const centralSize = centralParts.reduce((sum, chunk) => sum + chunk.length, 0)
  const endRecord = new Uint8Array(22)
  const endView = new DataView(endRecord.buffer)
  endView.setUint32(0, 0x06054B50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)
  endView.setUint16(20, 0, true)

  return concatUint8Arrays([...localParts, ...centralParts, endRecord])
}

function downloadBlobAsFile(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.style.display = 'none'
  const container = document.body ?? document.documentElement
  container.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 1000)
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return new TextEncoder().encode(dataUrl)

  const meta = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)

  if (/;base64/i.test(meta)) {
    const decoded = atob(payload)
    const bytes = new Uint8Array(decoded.length)
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index)
    }
    return bytes
  }

  return new TextEncoder().encode(decodeURIComponent(payload))
}

async function readMediaBytesForZip(pathLike: string): Promise<Uint8Array> {
  if (!pathLike) {
    throw new Error('Source clip is missing')
  }

  if (/^data:/i.test(pathLike)) {
    return dataUrlToBytes(pathLike)
  }

  const normalizedDataUrl = await readMediaAsDataUrl(pathLike)
  if (normalizedDataUrl) {
    return dataUrlToBytes(normalizedDataUrl)
  }

  if (/^(https?:|blob:)/i.test(pathLike)) {
    const response = await fetch(pathLike)
    if (!response.ok) {
      throw new Error(`Failed to fetch clip data: ${response.status}`)
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  throw new Error('Clip path is unsupported in browser export')
}

async function buildTimelineZipBytes(args: {
  timelineFilename: string
  timelineContent: string
  selectedClips: MediaClip[]
}): Promise<Uint8Array> {
  const entries: ZipEntry[] = [{
    name: args.timelineFilename,
    data: new TextEncoder().encode(args.timelineContent),
  }]

  const clipPathToName = new Map<string, string>()
  let mediaIndex = 0
  for (const clip of args.selectedClips) {
    const key = clip.path
    if (!key || clipPathToName.has(key)) continue
    mediaIndex += 1
    clipPathToName.set(key, buildMediaZipEntryName(key, mediaIndex))
  }

  for (const [clipPath, entryName] of clipPathToName.entries()) {
    const bytes = await readMediaBytesForZip(clipPath)
    entries.push({
      name: entryName,
      data: bytes,
    })
  }

  return buildZipBytes(entries)
}

function buildEdlContent(payload: ExportEdlPayload): string {
  const selectedClips = pickExportClips(payload)
  if (selectedClips.length === 0) {
    throw new Error('No clips available for EDL export')
  }

  const fps = Math.max(1, Math.floor(payload.fps ?? 30))
  const projectName = (payload.projectName || 'OpenFrame Export').trim() || 'OpenFrame Export'
  const title = sanitizeReelName(projectName)

  let recordStartFrames = 0
  const lines: string[] = [
    `TITLE: ${title}`,
    'FCM: NON-DROP FRAME',
    '',
  ]

  selectedClips.forEach((clip, index) => {
    const trimStartSec = Math.max(0, clip.trimStartSec ?? 0)
    const trimEndRaw = clip.trimEndSec ?? trimStartSec + 3
    const durationSec = Math.max(0.1, trimEndRaw - trimStartSec)

    const sourceInFrames = Math.round(trimStartSec * fps)
    const sourceOutFrames = sourceInFrames + Math.max(1, Math.round(durationSec * fps))
    const recordInFrames = recordStartFrames
    const recordOutFrames = recordInFrames + (sourceOutFrames - sourceInFrames)
    recordStartFrames = recordOutFrames

    const eventNo = String(index + 1).padStart(3, '0')
    const reelName = sanitizeReelName(
      clip.title || getBasenameWithoutExt(clip.path) || `SHOT${eventNo}`,
    )
    const clipName = (clip.title || getBasename(clip.path)).trim() || `Shot ${eventNo}`

    lines.push(
      `${eventNo}  ${reelName} V     C        ${framesToTimecode(sourceInFrames, fps)} ${framesToTimecode(sourceOutFrames, fps)} ${framesToTimecode(recordInFrames, fps)} ${framesToTimecode(recordOutFrames, fps)}`,
      `* FROM CLIP NAME: ${clipName}`,
      `* SOURCE FILE: ${clip.path}`,
      '',
    )
  })

  return `${lines.join('\n')}\n`
}

function buildFcpxmlContent(payload: ExportFcpxmlPayload): string {
  const selectedClips = pickExportClips(payload)
  if (selectedClips.length === 0) {
    throw new Error('No clips available for FCPXML export')
  }

  const fps = 30
  const format = formatResourceByRatio(payload.ratio)
  const projectName = (payload.projectName || 'OpenFrame Export').trim() || 'OpenFrame Export'

  const assets = selectedClips.map((clip, index) => {
    const trimStartSec = Math.max(0, clip.trimStartSec ?? 0)
    const trimEndRaw = clip.trimEndSec ?? trimStartSec + 3
    const trimDurationSec = Math.max(0.1, trimEndRaw - trimStartSec)
    const fallbackName = `Shot ${String(index + 1)}`
    return {
      id: `r_asset_${String(index + 1)}`,
      name: (clip.title || getBasenameWithoutExt(clip.path) || fallbackName).trim() || fallbackName,
      uid: clip.path,
      mediaSrc: clip.path,
      startSec: trimStartSec,
      durationSec: trimDurationSec,
    }
  })

  let timelineOffsetSec = 0
  const spineClips = assets.map((asset) => {
    const clip = {
      ...asset,
      offsetSec: timelineOffsetSec,
    }
    timelineOffsetSec += asset.durationSec
    return clip
  })

  const totalDurationSec = Math.max(0.1, spineClips.reduce((sum, clip) => sum + clip.durationSec, 0))

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE fcpxml>',
    '<fcpxml version="1.11">',
    '  <resources>',
    `    <format id="r_format" name="${escapeXml(format.formatName)}" frameDuration="1/${String(fps)}s" width="${String(format.width)}" height="${String(format.height)}" colorSpace="1-1-1 (Rec. 709)"/>`,
    ...assets.flatMap((asset) => [
      `    <asset id="${asset.id}" name="${escapeXml(asset.name)}" uid="${escapeXml(asset.uid)}" start="${secToFcpxTime(asset.startSec, fps)}" duration="${secToFcpxTime(asset.durationSec, fps)}" hasVideo="1" hasAudio="0" format="r_format">`,
      `      <media-rep kind="original-media" src="${escapeXml(asset.mediaSrc)}"/>`,
      '    </asset>',
    ]),
    '  </resources>',
    '  <library>',
    `    <event name="${escapeXml(projectName)}">`,
    `      <project name="${escapeXml(`${projectName} Timeline`)}">`,
    `        <sequence format="r_format" duration="${secToFcpxTime(totalDurationSec, fps)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">`,
    '          <spine>',
    ...spineClips.map((clip) =>
      `            <asset-clip name="${escapeXml(clip.name)}" ref="${clip.id}" offset="${secToFcpxTime(clip.offsetSec, fps)}" start="${secToFcpxTime(clip.startSec, fps)}" duration="${secToFcpxTime(clip.durationSec, fps)}"/>`),
    '          </spine>',
    '        </sequence>',
    '      </project>',
    '    </event>',
    '  </library>',
    '</fcpxml>',
  ].join('\n')
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

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function uploadMediaToObjectStorage(args: {
  data: Uint8Array
  ext: string
  folder?: 'thumbnails' | 'videos'
  config: ObjectStorageConfig
}): Promise<string> {
  const response = await fetch('/api/storage', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      config: args.config,
      ext: args.ext,
      folder: args.folder === 'videos' ? 'videos' : 'thumbnails',
      dataBase64: uint8ToBase64(args.data),
    }),
  })

  const payload = await response.json() as { ok: boolean; url?: string; error?: string }
  if (!response.ok || !payload.ok || !payload.url) {
    throw new Error(payload.error || `Storage upload failed (${response.status})`)
  }

  return payload.url
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

function triggerDownload(objectUrl: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.style.display = 'none'
  const container = document.body ?? document.documentElement
  container.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function pickMergeRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  const matched = candidates.find((value) => MediaRecorder.isTypeSupported(value))
  return matched ?? ''
}

function nextAnimationFrame(): Promise<number> {
  return new Promise((resolve) => {
    window.requestAnimationFrame((timestamp) => resolve(timestamp))
  })
}

function drawVideoFrameContain(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  outputWidth: number,
  outputHeight: number,
): void {
  const sourceWidth = video.videoWidth || outputWidth
  const sourceHeight = video.videoHeight || outputHeight
  const scale = Math.min(outputWidth / sourceWidth, outputHeight / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale
  const drawX = (outputWidth - drawWidth) / 2
  const drawY = (outputHeight - drawHeight) / 2

  context.fillStyle = '#000000'
  context.fillRect(0, 0, outputWidth, outputHeight)
  context.drawImage(video, drawX, drawY, drawWidth, drawHeight)
}

function loadVideoMetadata(video: HTMLVideoElement, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
    }
    const onLoaded = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Failed to load source clip for merged export'))
    }

    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('error', onError)
    video.src = src
    video.load()
  })
}

function seekVideo(video: HTMLVideoElement, nextTimeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = Math.max(0, nextTimeSec)
    if (Math.abs(video.currentTime - target) < 0.02) {
      resolve()
      return
    }

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Failed to seek source clip for merged export'))
    }

    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = target
  })
}

function stopMediaStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => {
    track.stop()
  })
}

async function resolveClipSourceForMerge(path: string): Promise<string> {
  if (!path) return ''
  if (/^(data:|blob:)/i.test(path)) return path
  if (/^(openframe-thumb:|https?:)/i.test(path)) {
    return (await readMediaAsDataUrl(path)) || path
  }
  return path
}

async function renderClipRangeToCanvas(args: {
  video: HTMLVideoElement
  context: CanvasRenderingContext2D
  outputWidth: number
  outputHeight: number
  trimStartSec: number
  trimEndSec: number
  fps: number
}): Promise<void> {
  const { video, context, outputWidth, outputHeight, trimStartSec, trimEndSec, fps } = args
  const minDuration = 1 / fps
  const safeEndSec = Math.max(trimStartSec + minDuration, trimEndSec)

  await seekVideo(video, trimStartSec)
  drawVideoFrameContain(context, video, outputWidth, outputHeight)

  try {
    await video.play()
  } catch {
    throw new Error('Browser blocked clip playback during merged export')
  }

  const endThreshold = 1 / fps
  while (video.currentTime < safeEndSec - endThreshold && !video.ended) {
    drawVideoFrameContain(context, video, outputWidth, outputHeight)
    await nextAnimationFrame()
  }

  video.pause()
  await seekVideo(video, safeEndSec)
  drawVideoFrameContain(context, video, outputWidth, outputHeight)
}

async function exportMergedVideoInBrowser(payload: ExportMergedVideoPayload): Promise<{ outputPath: string }> {
  const selectedClips = pickExportClips(payload)
  if (selectedClips.length === 0) {
    throw new Error('No clips available for merged video export')
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is unavailable in this browser')
  }

  const mimeType = pickMergeRecorderMimeType()
  const fps = 30
  const { width, height } = formatResourceByRatio(payload.ratio)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to initialize canvas for merged export')
  }

  const stream = canvas.captureStream(fps)
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream)
  const chunks: BlobPart[] = []
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  const blobPromise = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data)
    })
    recorder.addEventListener('stop', () => {
      if (chunks.length === 0) {
        reject(new Error('Merged export produced empty output'))
        return
      }
      const firstChunk = chunks[0]
      const fallbackType = firstChunk instanceof Blob ? firstChunk.type : 'video/webm'
      const outputType = mimeType || fallbackType || 'video/webm'
      resolve(new Blob(chunks, { type: outputType || 'video/webm' }))
    })
    recorder.addEventListener('error', () => {
      reject(new Error('MediaRecorder failed during merged export'))
    })
  })

  let recorderStarted = false
  let mergeError: Error | null = null

  try {
    recorder.start(250)
    recorderStarted = true
    for (const clip of selectedClips) {
      const source = await resolveClipSourceForMerge(clip.path)
      if (!source) {
        throw new Error('Source clip is missing or unsupported')
      }
      await loadVideoMetadata(video, source)

      const trimStartSec = Math.max(0, clip.trimStartSec ?? 0)
      const trimEndRaw = clip.trimEndSec ?? trimStartSec + 3
      const clipDuration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : trimEndRaw
      const trimEndSec = Math.max(
        trimStartSec + 0.1,
        Math.min(trimEndRaw, clipDuration),
      )

      await renderClipRangeToCanvas({
        video,
        context,
        outputWidth: width,
        outputHeight: height,
        trimStartSec,
        trimEndSec,
        fps,
      })
    }
  } catch (error) {
    mergeError = error instanceof Error ? error : new Error(String(error))
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    if (recorderStarted && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }

  try {
    if (!recorderStarted) {
      throw mergeError ?? new Error('Merged export failed before recording started')
    }

    const blob = await blobPromise
    if (mergeError) {
      throw mergeError
    }

    if (mergedVideoPreviewUrl) {
      URL.revokeObjectURL(mergedVideoPreviewUrl)
    }
    mergedVideoPreviewUrl = URL.createObjectURL(blob)

    const runId = Date.now().toString(36)
    triggerDownload(mergedVideoPreviewUrl, `merged_${runId}.webm`)
    return { outputPath: mergedVideoPreviewUrl }
  } finally {
    stopMediaStream(stream)
  }
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

async function removeCharacterReferencesFromCostumes(
  projectId: string,
  removedCharacterIds: Set<string>,
): Promise<void> {
  if (removedCharacterIds.size === 0) return
  const costumes = await getAllRows<CostumeRow>(STORE_NAMES.costumes)
  const targets = costumes.filter((row) => row.project_id === projectId)
  await Promise.all(targets.map(async (row) => {
    const currentCharacterIds = normalizeIds(row.character_ids)
    const nextCharacterIds = currentCharacterIds.filter((id) => !removedCharacterIds.has(id))
    if (nextCharacterIds.length === currentCharacterIds.length) return
    await putRow(STORE_NAMES.costumes, {
      ...row,
      character_ids: nextCharacterIds,
    } satisfies CostumeRow)
  }))
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
    costumes,
    scenes,
    shots,
    sceneLinks,
    characterLinks,
    propLinks,
    costumeLinks,
    vectorDocuments,
    vectorChunks,
  ] = await Promise.all([
    getAllRows<GenreRow>(STORE_NAMES.genres),
    getAllRows<ProjectRow>(STORE_NAMES.projects),
    getAllRows<SeriesRow>(STORE_NAMES.series),
    getAllRows<CharacterRow>(STORE_NAMES.characters),
    getAllRows<CharacterRelationRow>(STORE_NAMES.characterRelations),
    getAllRows<PropRow>(STORE_NAMES.props),
    getAllRows<CostumeRow>(STORE_NAMES.costumes),
    getAllRows<SceneRow>(STORE_NAMES.scenes),
    getAllRows<ShotRow>(STORE_NAMES.shots),
    getAllRows<SeriesSceneLinkRow>(STORE_NAMES.seriesSceneLinks),
    getAllRows<SeriesCharacterLinkRow>(STORE_NAMES.seriesCharacterLinks),
    getAllRows<SeriesPropLinkRow>(STORE_NAMES.seriesPropLinks),
    getAllRows<SeriesCostumeLinkRow>(STORE_NAMES.seriesCostumeLinks),
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
  costumes.forEach((row) => addThumb(row.thumbnail))
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
    ...costumes,
    ...scenes,
    ...shots,
    ...sceneLinks,
    ...characterLinks,
    ...propLinks,
    ...costumeLinks,
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
      const storageConfig = parseObjectStorageConfig(getStoredSetting('storage_config'))
      if (isObjectStorageEnabled(storageConfig)) {
        return uploadMediaToObjectStorage({ data, ext, folder, config: storageConfig })
      }
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
        removeRowsWhere<SeriesCostumeLinkRow>(
          STORE_NAMES.seriesCostumeLinks,
          (row) => row.project_id === id,
        ),
        removeRowsWhere<CharacterRow>(STORE_NAMES.characters, (row) => row.project_id === id),
        removeRowsWhere<CharacterRelationRow>(
          STORE_NAMES.characterRelations,
          (row) => row.project_id === id,
        ),
        removeRowsWhere<PropRow>(STORE_NAMES.props, (row) => row.project_id === id),
        removeRowsWhere<CostumeRow>(STORE_NAMES.costumes, (row) => row.project_id === id),
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
        removeRowsWhere<SeriesCostumeLinkRow>(
          STORE_NAMES.seriesCostumeLinks,
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
      const row = await getRowById<CharacterRow>(STORE_NAMES.characters, id)
      await Promise.all([
        removeRowsWhere<SeriesCharacterLinkRow>(
          STORE_NAMES.seriesCharacterLinks,
          (row) => row.character_id === id,
        ),
        deleteRowById(STORE_NAMES.characters, id),
      ])
      if (row?.project_id) {
        await removeCharacterReferencesFromCostumes(row.project_id, new Set([id]))
      }
    },
    replaceByProject: async (payload: { projectId: string; characters: CharacterRow[] }) => {
      const existingCharacters = await getAllRows<CharacterRow>(STORE_NAMES.characters)
      const removedIds = new Set(
        existingCharacters
          .filter((row) => row.project_id === payload.projectId)
          .map((row) => row.id)
          .filter((id) => !payload.characters.some((character) => character.id === id)),
      )
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
      await removeCharacterReferencesFromCostumes(payload.projectId, removedIds)
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

  runtimeWindow.costumesAPI = {
    getAll: async () => {
      const rows = await getAllRows<CostumeRow>(STORE_NAMES.costumes)
      return rows
        .map(normalizeCostumeRow)
        .sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<CostumeRow>(STORE_NAMES.costumes)
      return rows
        .filter((row) => row.project_id === projectId)
        .map(normalizeCostumeRow)
        .sort(sortByCreatedAsc)
    },
    getBySeries: async (seriesId: string) => {
      const [rows, links] = await Promise.all([
        getAllRows<CostumeRow>(STORE_NAMES.costumes),
        getAllRows<SeriesCostumeLinkRow>(STORE_NAMES.seriesCostumeLinks),
      ])
      const linkedIds = new Set(
        links
          .filter((link) => link.series_id === seriesId)
          .map((link) => link.costume_id),
      )
      return rows
        .filter((row) => linkedIds.has(row.id))
        .map(normalizeCostumeRow)
        .sort(sortByCreatedAsc)
    },
    insert: async (costume: CostumeRow) => {
      await putRow(STORE_NAMES.costumes, normalizeCostumeRow(costume))
    },
    update: async (costume: CostumeRow) => {
      await putRow(STORE_NAMES.costumes, normalizeCostumeRow(costume))
    },
    delete: async (id: string) => {
      await Promise.all([
        removeRowsWhere<SeriesCostumeLinkRow>(
          STORE_NAMES.seriesCostumeLinks,
          (row) => row.costume_id === id,
        ),
        deleteRowById(STORE_NAMES.costumes, id),
      ])
    },
    replaceByProject: async (payload: { projectId: string; costumes: CostumeRow[] }) => {
      await Promise.all([
        removeRowsWhere<SeriesCostumeLinkRow>(
          STORE_NAMES.seriesCostumeLinks,
          (row) => row.project_id === payload.projectId,
        ),
        removeRowsWhere<CostumeRow>(
          STORE_NAMES.costumes,
          (row) => row.project_id === payload.projectId,
        ),
      ])
      await Promise.all(payload.costumes.map((costume) =>
        putRow(STORE_NAMES.costumes, normalizeCostumeRow({
          ...costume,
          project_id: payload.projectId,
        })),
      ))
    },
    replaceBySeries: async (payload: {
      projectId: string
      seriesId: string
      costumes: CostumeRow[]
    }) => {
      await Promise.all(payload.costumes.map((costume) =>
        putRow(STORE_NAMES.costumes, normalizeCostumeRow({
          ...costume,
          project_id: payload.projectId,
        })),
      ))

      await removeRowsWhere<SeriesCostumeLinkRow>(
        STORE_NAMES.seriesCostumeLinks,
        (row) => row.project_id === payload.projectId && row.series_id === payload.seriesId,
      )
      const now = Date.now()
      await Promise.all(payload.costumes.map((costume) =>
        putRow(STORE_NAMES.seriesCostumeLinks, {
          id: buildCostumeLinkId(payload.seriesId, costume.id),
          project_id: payload.projectId,
          series_id: payload.seriesId,
          costume_id: costume.id,
          created_at: now,
        } satisfies SeriesCostumeLinkRow),
      ))
    },
    linkToSeries: async (payload: {
      project_id: string
      series_id: string
      costume_id: string
      created_at: number
    }) => {
      await putRow(STORE_NAMES.seriesCostumeLinks, {
        id: buildCostumeLinkId(payload.series_id, payload.costume_id),
        project_id: payload.project_id,
        series_id: payload.series_id,
        costume_id: payload.costume_id,
        created_at: payload.created_at,
      } satisfies SeriesCostumeLinkRow)
    },
    unlinkFromSeries: async (payload: { seriesId: string; costumeId: string }) => {
      await deleteRowById(
        STORE_NAMES.seriesCostumeLinks,
        buildCostumeLinkId(payload.seriesId, payload.costumeId),
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
      return rows
        .map(normalizeShotRow)
        .sort(sortByCreatedDesc)
    },
    getBySeries: async (seriesId: string) => {
      const rows = await getAllRows<ShotRow>(STORE_NAMES.shots)
      return rows
        .filter((row) => row.series_id === seriesId)
        .map(normalizeShotRow)
        .sort((left, right) => left.shot_index - right.shot_index || left.created_at - right.created_at)
    },
    insert: async (shot: ShotRow) => {
      await putRow(STORE_NAMES.shots, normalizeShotRow(shot))
    },
    update: async (shot: ShotRow) => {
      await putRow(STORE_NAMES.shots, normalizeShotRow(shot))
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
          ...normalizeShotRow(shot),
          series_id: payload.seriesId,
        }),
      ))

      const series = await getRowById<SeriesRow>(STORE_NAMES.series, payload.seriesId)
      if (!series) return

      const now = Date.now()
      for (const rawShot of payload.shots) {
        const shot = normalizeShotRow(rawShot)
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

        for (const costumeId of shot.costume_ids) {
          await putRow(STORE_NAMES.seriesCostumeLinks, {
            id: buildCostumeLinkId(payload.seriesId, costumeId),
            project_id: series.project_id,
            series_id: payload.seriesId,
            costume_id: costumeId,
            created_at: now,
          } satisfies SeriesCostumeLinkRow)
        }
      }
    },
  }

  runtimeWindow.windowAPI = {
    openStudio: async (payload: { projectId: string; seriesId: string }) => {
      const nextHash = `#/projects/${encodeURIComponent(payload.projectId)}?studio=1&seriesId=${encodeURIComponent(payload.seriesId)}`
      window.location.hash = nextHash
    },
    openExternal: async (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    getVersion: async () => resolveWebAppVersion(),
  }

  runtimeWindow.mediaAPI = {
    autoEdit: async (payload) => {
      const first = payload.clips[0]?.path
      if (!first) throw new Error('No clip available for auto edit')
      return { outputPath: first }
    },
    exportMergedVideo: async (payload: ExportMergedVideoPayload) => {
      return exportMergedVideoInBrowser(payload)
    },
    exportFcpxml: async (payload: ExportFcpxmlPayload) => {
      const runId = Date.now().toString(36)
      const selectedClips = pickExportClips(payload)
      const timelineFilename = `timeline_${runId}.fcpxml`
      const zipFilename = `timeline_${runId}.zip`
      const content = buildFcpxmlContent(payload)
      const zipBytes = await buildTimelineZipBytes({
        timelineFilename,
        timelineContent: content,
        selectedClips,
      })
      downloadBlobAsFile(
        new Blob([toArrayBuffer(zipBytes)], { type: 'application/zip' }),
        zipFilename,
      )
      return { outputPath: zipFilename }
    },
    exportEdl: async (payload: ExportEdlPayload) => {
      const runId = Date.now().toString(36)
      const selectedClips = pickExportClips(payload)
      const timelineFilename = `timeline_${runId}.edl`
      const zipFilename = `timeline_${runId}.zip`
      const content = buildEdlContent(payload)
      const zipBytes = await buildTimelineZipBytes({
        timelineFilename,
        timelineContent: content,
        selectedClips,
      })
      downloadBlobAsFile(
        new Blob([toArrayBuffer(zipBytes)], { type: 'application/zip' }),
        zipFilename,
      )
      return { outputPath: zipFilename }
    },
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
