import { createCollection } from '@tanstack/db'
import type { OperationType } from '@tanstack/db'

export interface Setting {
  id: string
  value: string
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
      syncCallbacks = params as unknown as SyncCallbacks
      const { begin, write, commit, markReady } = params
      window.settingsAPI
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
    for (const m of transaction.mutations) {
      const item = m.modified as Setting
      await window.settingsAPI.upsert(item.id, item.value)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Setting; modified: Setting }>)
  },
  onUpdate: async ({ transaction }) => {
    for (const m of transaction.mutations) {
      const item = m.modified as Setting
      await window.settingsAPI.upsert(item.id, item.value)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Setting; modified: Setting }>)
  },
  onDelete: async ({ transaction }) => {
    for (const m of transaction.mutations) {
      const item = m.original as Setting
      await window.settingsAPI.delete(item.id)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Setting; modified: Setting }>)
  },
})
