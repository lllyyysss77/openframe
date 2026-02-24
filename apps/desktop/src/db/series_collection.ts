import { createCollection } from '@tanstack/db'
import type { OperationType } from '@tanstack/db'

export interface Series {
  id: string
  project_id: string
  sort_index: number
  thumbnail: string | null
  duration: number
  created_at: number
}

type SyncCallbacks = {
  begin: () => void
  write: (msg: { type: Exclude<OperationType, 'delete'>; value: Series } | { type: 'delete' }) => void
  commit: () => void
}

let syncCallbacks: SyncCallbacks | null = null

function confirmSync(mutations: Array<{ type: OperationType; original: Series; modified: Series }>) {
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

export const seriesCollection = createCollection<Series>({
  id: 'series',
  getKey: (item) => item.id,
  sync: {
    sync: (params) => {
      syncCallbacks = params as unknown as SyncCallbacks
      const { begin, write, commit, markReady } = params
      window.seriesAPI
        .getAll()
        .then((rows) => {
          if (rows.length > 0) {
            begin()
            rows.forEach((row) => write({ type: 'insert', value: row }))
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
      const item = m.modified as Series
      await window.seriesAPI.insert(item)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Series; modified: Series }>)
  },
  onUpdate: async ({ transaction }) => {
    for (const m of transaction.mutations) {
      const item = m.modified as Series
      await window.seriesAPI.update(item)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Series; modified: Series }>)
  },
  onDelete: async ({ transaction }) => {
    for (const m of transaction.mutations) {
      const item = m.original as Series
      await window.seriesAPI.delete(item.id)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Series; modified: Series }>)
  },
})
