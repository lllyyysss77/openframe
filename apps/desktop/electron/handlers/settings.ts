import { ipcMain } from 'electron'
import { getRawDb } from '../db'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:getAll', () => {
    const raw = getRawDb()
    return raw.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
  })

  ipcMain.handle('settings:upsert', (_event, key: string, value: string) => {
    const raw = getRawDb()
    raw.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  })

  ipcMain.handle('settings:delete', (_event, key: string) => {
    const raw = getRawDb()
    raw.prepare('DELETE FROM settings WHERE key = ?').run(key)
  })
}
