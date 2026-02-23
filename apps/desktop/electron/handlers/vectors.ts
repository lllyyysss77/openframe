import { ipcMain } from 'electron'
import { getRawDb } from '../db'
import { store } from '../store'

function f32(arr: number[]): Buffer {
  return Buffer.from(new Float32Array(arr).buffer)
}

export type ChunkRow = {
  chunk_id: number
  document_id: string
  content: string
  chunk_index: number
  distance: number
}

export function registerVectorsHandlers() {
  // Insert a document record
  ipcMain.handle(
    'vectors:insertDocument',
    (_event, doc: { id: string; title: string; type: string; project_id?: string }): void => {
      const db = getRawDb()
      db.prepare(`
        INSERT OR REPLACE INTO documents (id, title, type, project_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(doc.id, doc.title, doc.type, doc.project_id ?? null, Math.floor(Date.now() / 1000))
    },
  )

  // Insert a chunk with its embedding
  ipcMain.handle(
    'vectors:insertChunk',
    (_event, chunk: { document_id: string; content: string; chunk_index: number; embedding: number[] }): number => {
      const db = getRawDb()
      const result = db.prepare(`
        INSERT INTO chunks (document_id, content, chunk_index, created_at)
        VALUES (?, ?, ?, ?)
      `).run(chunk.document_id, chunk.content, chunk.chunk_index, Math.floor(Date.now() / 1000))

      const chunkId = result.lastInsertRowid as number
      db.prepare(`
        INSERT INTO vec_chunks (chunk_id, embedding)
        VALUES (?, ?)
      `).run(chunkId, f32(chunk.embedding))

      return chunkId
    },
  )

  // KNN vector search
  ipcMain.handle(
    'vectors:search',
    (_event, params: { embedding: number[]; limit?: number; document_id?: string }): ChunkRow[] => {
      const db = getRawDb()
      const { embedding, limit = 5, document_id } = params
      const blob = f32(embedding)

      if (document_id) {
        return db.prepare(`
          SELECT v.chunk_id, c.document_id, c.content, c.chunk_index, v.distance
          FROM vec_chunks v
          JOIN chunks c ON v.chunk_id = c.id
          WHERE v.embedding MATCH ?
            AND k = ?
            AND c.document_id = ?
          ORDER BY v.distance
        `).all(blob, limit, document_id) as ChunkRow[]
      }

      return db.prepare(`
        SELECT v.chunk_id, c.document_id, c.content, c.chunk_index, v.distance
        FROM vec_chunks v
        JOIN chunks c ON v.chunk_id = c.id
        WHERE v.embedding MATCH ?
          AND k = ?
        ORDER BY v.distance
      `).all(blob, limit) as ChunkRow[]
    },
  )

  // Get the current stored vector dimension
  ipcMain.handle('vectors:getDimension', (): number => {
    return store.get('vec_dimension') as number ?? 0
  })

  // Delete all chunks and the document record
  ipcMain.handle('vectors:deleteDocument', (_event, document_id: string): void => {
    const db = getRawDb()
    const rows = db.prepare('SELECT id FROM chunks WHERE document_id = ?').all(document_id) as { id: number }[]
    if (rows.length > 0) {
      const placeholders = rows.map(() => '?').join(', ')
      db.prepare(`DELETE FROM vec_chunks WHERE chunk_id IN (${placeholders})`).run(...rows.map((r) => r.id))
      db.prepare('DELETE FROM chunks WHERE document_id = ?').run(document_id)
    }
    db.prepare('DELETE FROM documents WHERE id = ?').run(document_id)
  })
}
