import { ipcMain, dialog, app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { store } from '../store'
import { getDataDir } from '../data_dir'

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

export function registerDataHandlers() {
  ipcMain.handle('data:getInfo', () => {
    const defaultDir = app.getPath('userData')
    const currentDir = getDataDir()
    const pendingDir = store.get('data_dir') || ''

    const dbPath = path.join(currentDir, 'app.db')
    const thumbsDir = path.join(currentDir, 'thumbnails')

    return {
      defaultDir,
      currentDir,
      pendingDir,
      dbSize: fileSize(dbPath),
      thumbsSize: dirSize(thumbsDir),
    }
  })

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
