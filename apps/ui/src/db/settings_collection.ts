import { createCollection } from '@tanstack/db'
import type { OperationType } from '@tanstack/db'
import { ensureWebRuntimeAPIs } from '../platform/web_runtime_api'

ensureWebRuntimeAPIs()

export interface Setting {
  id: string
  value: string
}

const FALLBACK_SETTING_KEYS = [
  'language',
  'theme',
  'onboarding_seen',
  'onboarding_version',
  'update_dismissed_version',
  'prompt_overrides',
  'storage_config',
] as const

const FALLBACK_STORAGE_PREFIX = 'openframe:fallback:setting:'

type SettingsApi = {
  getAll: () => Promise<Array<{ key: string; value: string }>>
  upsert: (key: string, value: string) => Promise<void>
  delete: (key: string) => Promise<void>
}

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  } catch {
    return false
  }
}

function fallbackStorageKey(key: string): string {
  return `${FALLBACK_STORAGE_PREFIX}${key}`
}

const fallbackSettingsApi: SettingsApi = {
  getAll: async () => {
    if (!hasStorage()) return []
    return FALLBACK_SETTING_KEYS.map((key) => ({
      key,
      value: window.localStorage.getItem(fallbackStorageKey(key)) ?? '',
    }))
  },
  upsert: async (key, value) => {
    if (!hasStorage()) return
    window.localStorage.setItem(fallbackStorageKey(key), value)
  },
  delete: async (key) => {
    if (!hasStorage()) return
    window.localStorage.removeItem(fallbackStorageKey(key))
  },
}

function getSettingsApi(): SettingsApi {
  const runtimeWindow = window as Window & { settingsAPI?: SettingsApi }
  return runtimeWindow.settingsAPI ?? fallbackSettingsApi
}

type SyncCallbacks = {
  begin: () => void
  write: (msg: { type: Exclude<OperationType, 'delete'>; value: Setting } | { type: 'delete' }) => void
  commit: () => void
}

let syncCallbacks: SyncCallbacks | null = null

function confirmSync(mutations: Array<{ type: OperationType; original: Setting; modified: Setting }>) {
  if (!syncCallbacks) return
  const { begin, write, commit } = syncCallbacks
  begin()
  mutations.forEach((m) => {
    if (m.type === 'delete') {
      write({ type: 'delete' })
    } else {
      write({ type: m.type, value: m.modified })
    }
  })
  commit()
}

export const settingsCollection = createCollection<Setting>({
  id: 'settings',
  getKey: (item) => item.id,
  sync: {
    sync: (params) => {
      const settingsApi = getSettingsApi()
      syncCallbacks = params as unknown as SyncCallbacks
      const { begin, write, commit, markReady } = params
      settingsApi
        .getAll()
        .then((rows) => {
          if (rows.length > 0) {
            begin()
            rows.forEach((row) => write({ type: 'insert', value: { id: row.key, value: row.value } }))
            commit()
          }
          markReady()
        })
        .catch(() => markReady())
      return () => {
        syncCallbacks = null
      }
    },
    getSyncMetadata: () => ({}),
  },
  startSync: true,
  gcTime: 0,
  onInsert: async ({ transaction }) => {
    const settingsApi = getSettingsApi()
    for (const m of transaction.mutations) {
      const item = m.modified as Setting
      await settingsApi.upsert(item.id, item.value)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Setting; modified: Setting }>)
  },
  onUpdate: async ({ transaction }) => {
    const settingsApi = getSettingsApi()
    for (const m of transaction.mutations) {
      const item = m.modified as Setting
      await settingsApi.upsert(item.id, item.value)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Setting; modified: Setting }>)
  },
  onDelete: async ({ transaction }) => {
    const settingsApi = getSettingsApi()
    for (const m of transaction.mutations) {
      const item = m.original as Setting
      await settingsApi.delete(item.id)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Setting; modified: Setting }>)
  },
})
