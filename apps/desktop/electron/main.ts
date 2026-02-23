import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getDb, closeDb } from './db'
import { registerSqliteHandlers } from './handlers/sqlite'
import { registerSettingsHandlers } from './handlers/settings'
import { registerGenresHandlers } from './handlers/genres'
import { registerThumbnailsHandlers } from './handlers/thumbnails'
import { registerAIHandlers } from './handlers/ai'
import { registerVectorsHandlers } from './handlers/vectors'
import { registerDataHandlers } from './handlers/data'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    width: 1440,
    height: 900,
  })

  if (VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools()
  }

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', closeDb)

app.whenReady().then(() => {
  getDb() // 初始化并运行迁移
  registerSqliteHandlers()
  registerSettingsHandlers()
  registerGenresHandlers()
  registerThumbnailsHandlers()
  registerAIHandlers()
  registerVectorsHandlers()
  registerDataHandlers()
  createWindow()
})
