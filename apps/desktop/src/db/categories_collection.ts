import { createCollection } from '@tanstack/db'
import type { OperationType } from '@tanstack/db'

export interface Category {
  id: string
  name: string
  code: string
  created_at: number
}

type SyncCallbacks = {
  begin: () => void
  write: (msg: { type: Exclude<OperationType, 'delete'>; value: Category } | { type: 'delete' }) => void
  commit: () => void
}

let syncCallbacks: SyncCallbacks | null = null

function confirmSync(mutations: Array<{ type: OperationType; original: Category; modified: Category }>) {
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

export const categoriesCollection = createCollection<Category>({
  id: 'categories',
  getKey: (item) => item.id,
  sync: {
    sync: (params) => {
      syncCallbacks = params as unknown as SyncCallbacks
      const { begin, write, commit, markReady } = params
      window.categoriesAPI
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
      const item = m.modified as Category
      await window.categoriesAPI.insert(item)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Category; modified: Category }>)
  },
  onUpdate: async ({ transaction }) => {
    for (const m of transaction.mutations) {
      const item = m.modified as Category
      await window.categoriesAPI.update(item)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Category; modified: Category }>)
  },
  onDelete: async ({ transaction }) => {
    for (const m of transaction.mutations) {
      const item = m.original as Category
      await window.categoriesAPI.delete(item.id)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Category; modified: Category }>)
  },
})
