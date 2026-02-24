import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getDataDir } from '../data_dir'

function getThumbsDir() {
  return path.join(getDataDir(), 'thumbnails')
}

function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.avif') return 'image/avif'
  return 'application/octet-stream'
}

export function registerThumbnailsHandlers() {
  ipcMain.handle('thumbnails:save', (_event, data: Uint8Array, ext: string) => {
    const thumbsDir = getThumbsDir()
    fs.mkdirSync(thumbsDir, { recursive: true })
    const filename = `${randomUUID()}.${ext}`
    const filepath = path.join(thumbsDir, filename)
    fs.writeFileSync(filepath, Buffer.from(data))
    return filepath
  })

  ipcMain.handle('thumbnails:delete', (_event, filepath: string) => {
    try {
      if (filepath && filepath.startsWith(getThumbsDir())) {
        fs.unlinkSync(filepath)
      }
    } catch {
      // 文件不存在时静默处理
    }
  })

  ipcMain.handle('thumbnails:readBase64', (_event, filepath: string) => {
    try {
      if (!filepath || !filepath.startsWith(getThumbsDir())) return null
      const buf = fs.readFileSync(filepath)
      if (!buf.length) return null
      const mediaType = contentTypeFromPath(filepath)
      return `data:${mediaType};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })
}
