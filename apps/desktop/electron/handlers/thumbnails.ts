import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getDataDir } from '../data_dir'

function getThumbsDir() {
  return path.join(getDataDir(), 'thumbnails')
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
}
