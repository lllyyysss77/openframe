import { ipcMain } from 'electron'
import { getRawDb } from '../db'

type GenreRow = {
  id: string
  name: string
  code: string
  description: string
  prompt: string
  thumbnail: string | null
  created_at: number
}

type CategoryRow = {
  id: string
  name: string
  code: string
  created_at: number
}

export function registerGenresHandlers() {
  // ── Genres ──────────────────────────────────────────────────────────────────

  ipcMain.handle('genres:getAll', () => {
    const raw = getRawDb()
    return raw
      .prepare(
        'SELECT id, name, code, description, prompt, thumbnail, created_at FROM genres ORDER BY created_at DESC',
      )
      .all() as GenreRow[]
  })

  ipcMain.handle('genres:insert', (_event, genre: GenreRow) => {
    const raw = getRawDb()
    raw
      .prepare(
        'INSERT INTO genres (id, name, code, description, prompt, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(genre.id, genre.name, genre.code, genre.description, genre.prompt, genre.thumbnail, genre.created_at)
  })

  ipcMain.handle('genres:update', (_event, genre: GenreRow) => {
    const raw = getRawDb()
    raw
      .prepare(
        'UPDATE genres SET name = ?, code = ?, description = ?, prompt = ?, thumbnail = ? WHERE id = ?',
      )
      .run(genre.name, genre.code, genre.description, genre.prompt, genre.thumbnail, genre.id)
  })

  ipcMain.handle('genres:delete', (_event, id: string) => {
    const raw = getRawDb()
    raw.prepare('DELETE FROM genres WHERE id = ?').run(id)
  })

  // ── Categories ───────────────────────────────────────────────────────────────

  ipcMain.handle('categories:getAll', () => {
    const raw = getRawDb()
    return raw
      .prepare('SELECT id, name, code, created_at FROM genre_categories ORDER BY created_at DESC')
      .all() as CategoryRow[]
  })

  ipcMain.handle('categories:insert', (_event, category: CategoryRow) => {
    const raw = getRawDb()
    raw
      .prepare('INSERT INTO genre_categories (id, name, code, created_at) VALUES (?, ?, ?, ?)')
      .run(category.id, category.name, category.code, category.created_at)
  })

  ipcMain.handle('categories:update', (_event, category: CategoryRow) => {
    const raw = getRawDb()
    raw.prepare('UPDATE genre_categories SET name = ?, code = ? WHERE id = ?').run(category.name, category.code, category.id)
  })

  ipcMain.handle('categories:delete', (_event, id: string) => {
    const raw = getRawDb()
    raw.prepare('DELETE FROM genre_categories WHERE id = ?').run(id)
  })
}
