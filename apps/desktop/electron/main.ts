import { app, BrowserWindow, ipcMain, protocol, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import { closeDb } from './db'
import { registerSettingsHandlers } from './handlers/settings'
import { registerThumbnailsHandlers } from './handlers/thumbnails'
import { registerAIHandlers } from './handlers/ai'
import { getDataDir } from './data_dir'
import { registerDatabaseHandlers } from './db-ops/register/handlers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null

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

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function createStudioWindow(projectId: string, seriesId: string) {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea

  const studioWin = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    titleBarStyle: 'hiddenInset',
    x,
    y,
    width,
    height,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  const studioHashPath = `/projects/${encodeURIComponent(projectId)}?studio=1&projectId=${encodeURIComponent(projectId)}&seriesId=${encodeURIComponent(seriesId)}`

  if (VITE_DEV_SERVER_URL) {
    studioWin.loadURL(`${VITE_DEV_SERVER_URL}#${studioHashPath}`)
  } else {
    studioWin.loadURL(`file://${path.join(RENDERER_DIST, 'index.html')}#${studioHashPath}`)
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
  protocol.handle('openframe-thumb', async (request) => {
    try {
      const url = new URL(request.url)
      const raw = url.searchParams.get('path')
      if (!raw) return new Response('Missing path', { status: 400 })

      const requestedPath = path.resolve(decodeURIComponent(raw))
      const thumbsDir = path.resolve(path.join(getDataDir(), 'thumbnails')) + path.sep
      if (!requestedPath.startsWith(thumbsDir)) {
        return new Response('Forbidden', { status: 403 })
      }

      const data = await fs.readFile(requestedPath)
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: { 'content-type': contentTypeFromPath(requestedPath) },
      })
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })

  registerDatabaseHandlers()
  registerSettingsHandlers()
  registerThumbnailsHandlers()
  registerAIHandlers()

  ipcMain.handle('window:openStudio', (_event, payload: { projectId: string; seriesId: string }) => {
    createStudioWindow(payload.projectId, payload.seriesId)
  })

  createWindow()
})
