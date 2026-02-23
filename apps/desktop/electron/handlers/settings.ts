import { ipcMain } from 'electron'
import { store } from '../store'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:getAll', (): Array<{ key: string; value: string }> => [
    { key: 'language', value: store.get('language') },
    { key: 'theme',    value: store.get('theme') },
  ])

  ipcMain.handle('settings:upsert', (_event, key: string, value: string) => {
    if (key === 'language' || key === 'theme') store.set(key, value)
  })

  ipcMain.handle('settings:delete', (_event, key: string) => {
    if (key === 'language' || key === 'theme') store.delete(key)
  })
}
