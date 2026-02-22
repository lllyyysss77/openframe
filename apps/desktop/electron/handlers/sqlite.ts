import { ipcMain } from 'electron'
import { getRawDb } from '../db'

export function registerSqliteHandlers() {
  ipcMain.handle('db:query', (_event, sql: string, params: unknown[] = []) => {
    const raw = getRawDb()
    const result = raw.prepare(sql).run(params)
    return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) }
  })

  ipcMain.handle('db:select', (_event, sql: string, params: unknown[] = []) => {
    const raw = getRawDb()
    return raw.prepare(sql).all(params)
  })
}
