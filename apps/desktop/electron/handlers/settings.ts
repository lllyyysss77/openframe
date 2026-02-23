import { ipcMain } from 'electron'
import Store from 'electron-store'

interface SettingsSchema {
  language: string
  theme: string
  ai_config: string
}

const store = new Store<SettingsSchema>({
  name: 'settings',
  schema: {
    language: {
      type: 'string',
      enum: ['en', 'zh'],
      default: 'en',
    },
    theme: {
      type: 'string',
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },
    ai_config: {
      type: 'string',
      default: '',
    },
  },
})

export function registerSettingsHandlers() {
  ipcMain.handle('settings:getAll', (): Array<{ key: string; value: string }> =>
    Object.entries(store.store).map(([key, value]) => ({ key, value: value as string })),
  )

  ipcMain.handle('settings:upsert', (_event, key: string, value: string) => {
    store.set(key as keyof SettingsSchema, value)
  })

  ipcMain.handle('settings:delete', (_event, key: string) => {
    store.delete(key as keyof SettingsSchema)
  })
}
