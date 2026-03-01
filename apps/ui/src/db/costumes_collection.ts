import { createCollection } from '@tanstack/db'
import type { OperationType } from '@tanstack/db'
import { ensureWebRuntimeAPIs } from '../platform/web_runtime_api'

ensureWebRuntimeAPIs()

export interface Costume {
  id: string
  project_id: string
  name: string
  category: string
  description: string
  character_ids: string[]
  thumbnail: string | null
  created_at: number
}

type SyncCallbacks = {
  begin: () => void
  write: (msg: { type: Exclude<OperationType, 'delete'>; value: Costume } | { type: 'delete' }) => void
  commit: () => void
}

let syncCallbacks: SyncCallbacks | null = null

function confirmSync(mutations: Array<{ type: OperationType; original: Costume; modified: Costume }>) {
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

export const costumesCollection = createCollection<Costume>({
  id: 'costumes',
  getKey: (item) => item.id,
  sync: {
    sync: (params) => {
      syncCallbacks = params as unknown as SyncCallbacks
      const { begin, write, commit, markReady } = params
      window.costumesAPI
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
      const item = m.modified as Costume
      await window.costumesAPI.insert(item)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Costume; modified: Costume }>)
  },
  onUpdate: async ({ transaction }) => {
    for (const m of transaction.mutations) {
      const item = m.modified as Costume
      await window.costumesAPI.update(item)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Costume; modified: Costume }>)
  },
  onDelete: async ({ transaction }) => {
    for (const m of transaction.mutations) {
      const item = m.original as Costume
      await window.costumesAPI.delete(item.id)
    }
    confirmSync(transaction.mutations as unknown as Array<{ type: OperationType; original: Costume; modified: Costume }>)
  },
})
