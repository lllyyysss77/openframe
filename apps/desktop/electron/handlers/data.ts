import { ipcMain, dialog, app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { store } from '../store'
import { getDataDir } from '../data_dir'
import { getRawDb } from '../db'

function dirSize(dir: string): number {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    return entries.reduce((acc, entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return acc + dirSize(full)
      try { return acc + fs.statSync(full).size } catch { return acc }
    }, 0)
  } catch {
    return 0
  }
}

function fileSize(p: string): number {
  try { return fs.statSync(p).size } catch { return 0 }
}

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
  '.avif',
])

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
])

function getThumbsDir(baseDir: string): string {
  return path.join(baseDir, 'thumbnails')
}

function getVideosDir(baseDir: string): string {
  return path.join(baseDir, 'videos')
}

function isSubPath(filePath: string, parentDir: string): boolean {
  const relative = path.relative(parentDir, filePath)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function normalizeStoredPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) return null

  if (value.startsWith('openframe-thumb://')) {
    try {
      const url = new URL(value)
      const localPath = url.searchParams.get('path')
      return localPath ? decodeURIComponent(localPath) : null
    } catch {
      return null
    }
  }

  if (value.startsWith('file://')) {
    try {
      return fileURLToPath(value)
    } catch {
      return null
    }
  }

  return value
}

function walkFiles(dir: string): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    return entries.flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return walkFiles(full)
      return [full]
    })
  } catch {
    return []
  }
}

function collectReferencedMediaPaths(mediaDirs: { thumbsDir: string; videosDir: string }): Set<string> {
  const db = getRawDb()
  const refs = new Set<string>()

  function addRef(value: unknown): void {
    const normalized = normalizeStoredPath(value)
    if (!normalized) return
    const resolved = path.resolve(normalized)
    if (isSubPath(resolved, mediaDirs.thumbsDir) || isSubPath(resolved, mediaDirs.videosDir)) {
      refs.add(resolved)
    }
  }

  function collect(sql: string, columns: string[]): void {
    try {
      const rows = db.prepare(sql).all() as Array<Record<string, unknown>>
      for (const row of rows) {
        for (const column of columns) addRef(row[column])
      }
    } catch {
      // ignore query errors for compatibility with partial schemas
    }
  }

  collect('SELECT thumbnail FROM projects', ['thumbnail'])
  collect('SELECT thumbnail FROM series', ['thumbnail'])
  collect('SELECT thumbnail FROM characters', ['thumbnail'])
  collect('SELECT thumbnail FROM props', ['thumbnail'])
  collect('SELECT thumbnail FROM costumes', ['thumbnail'])
  collect('SELECT thumbnail FROM scenes', ['thumbnail'])
  collect('SELECT thumbnail FROM genres', ['thumbnail'])
  collect(
    'SELECT thumbnail, production_first_frame, production_last_frame, production_video FROM shots',
    ['thumbnail', 'production_first_frame', 'production_last_frame', 'production_video'],
  )

  return refs
}

function mediaTypeByPath(filePath: string): 'image' | 'video' | null {
  const ext = path.extname(filePath).toLowerCase()
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  return null
}

export function registerDataHandlers() {
  ipcMain.handle('data:getInfo', () => {
    const defaultDir = app.getPath('userData')
    const currentDir = getDataDir()
    const pendingDir = store.get('data_dir') || ''

    const dbPath = path.join(currentDir, 'app.db')
    const thumbsDir = getThumbsDir(currentDir)
    const videosDir = getVideosDir(currentDir)

    return {
      defaultDir,
      currentDir,
      pendingDir,
      dbSize: fileSize(dbPath),
      thumbsSize: dirSize(thumbsDir),
      videosSize: dirSize(videosDir),
    }
  })

  ipcMain.handle(
    'data:cleanupUnusedMedia',
    (): { removedImages: number; removedVideos: number; freedBytes: number } => {
      const currentDir = getDataDir()
      const thumbsDir = getThumbsDir(currentDir)
      const videosDir = getVideosDir(currentDir)

      const referenced = collectReferencedMediaPaths({ thumbsDir, videosDir })
      const files = [...walkFiles(thumbsDir), ...walkFiles(videosDir)]

      let removedImages = 0
      let removedVideos = 0
      let freedBytes = 0

      for (const filePath of files) {
        const resolved = path.resolve(filePath)
        if (referenced.has(resolved)) continue
        if (!isSubPath(resolved, thumbsDir) && !isSubPath(resolved, videosDir)) continue

        const mediaType = mediaTypeByPath(resolved)
        if (!mediaType) continue

        try {
          const size = fs.statSync(resolved).size
          fs.unlinkSync(resolved)
          freedBytes += size
          if (mediaType === 'image') removedImages += 1
          if (mediaType === 'video') removedVideos += 1
        } catch {
          // ignore delete failures
        }
      }

      return { removedImages, removedVideos, freedBytes }
    },
  )

  ipcMain.handle('data:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getDataDir(),
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('data:setDirectory', (_event, newDir: string) => {
    store.set('data_dir', newDir)
  })

  ipcMain.handle('data:resetDirectory', () => {
    store.set('data_dir', '')
  })

  ipcMain.handle('data:openDirectory', () => {
    shell.openPath(getDataDir())
  })

  ipcMain.handle('data:restart', () => {
    app.relaunch()
    app.exit(0)
  })
}
