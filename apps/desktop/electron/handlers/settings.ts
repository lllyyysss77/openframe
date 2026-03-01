import { ipcMain } from 'electron'
import { store } from '../store'

type AllowedSettingKey =
  | 'language'
  | 'theme'
  | 'onboarding_seen'
  | 'onboarding_version'
  | 'update_dismissed_version'
  | 'prompt_overrides'
  | 'storage_config'
const allowedKeys: AllowedSettingKey[] = [
  'language',
  'theme',
  'onboarding_seen',
  'onboarding_version',
  'update_dismissed_version',
  'prompt_overrides',
  'storage_config',
]

function isAllowedSettingKey(key: string): key is AllowedSettingKey {
  return allowedKeys.includes(key as AllowedSettingKey)
}

export function registerSettingsHandlers() {
  ipcMain.handle('settings:getAll', (): Array<{ key: string; value: string }> => [
    { key: 'language', value: store.get('language') },
    { key: 'theme',    value: store.get('theme') },
    { key: 'onboarding_seen', value: store.get('onboarding_seen') },
    { key: 'onboarding_version', value: store.get('onboarding_version') },
    { key: 'update_dismissed_version', value: store.get('update_dismissed_version') },
    { key: 'prompt_overrides', value: store.get('prompt_overrides') },
    { key: 'storage_config', value: store.get('storage_config') },
  ])

  ipcMain.handle('settings:upsert', (_event, key: string, value: string) => {
    if (isAllowedSettingKey(key)) store.set(key, value)
  })

  ipcMain.handle('settings:delete', (_event, key: string) => {
    if (isAllowedSettingKey(key)) store.delete(key)
  })
}
