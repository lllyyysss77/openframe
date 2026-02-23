import { createCollection } from '@tanstack/db'
import type { OperationType } from '@tanstack/db'

export interface Genre {
  id: string
  name: string
  code: string
  description: string
  prompt: string
  thumbnail: string | null
  created_at: number
}

type SyncCallbacks = {
  begin: () => void
  write: (msg: { type: Exclude<OperationType, 'delete'>; value: Genre } | { type: 'delete' }) => void
  commit: () => void
}

let syncCallbacks: SyncCallbacks | null = null

function confirmSync(mutations: Array<{ type: OperationType; original: Genre; modified: Genre }>) {
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

export const genresCollection = createCollection<Genre>({
  id: 'genres',
  getKey: (item) => item.id,
  sync: {
    sync: (params) => {
      syncCallbacks = params as unknown as SyncCallbacks
      const { begin, write, commit, markReady } = params
      window.genresAPI
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
      const item = m.modified as Genre
      await window.genresAPI.insert(item)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Genre; modified: Genre }>)
  },
  onUpdate: async ({ transaction }) => {
    for (const m of transaction.mutations) {
      const item = m.modified as Genre
      await window.genresAPI.update(item)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Genre; modified: Genre }>)
  },
  onDelete: async ({ transaction }) => {
    for (const m of transaction.mutations) {
      const item = m.original as Genre
      await window.genresAPI.delete(item.id)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Genre; modified: Genre }>)
  },
})
