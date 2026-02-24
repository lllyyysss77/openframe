import { getRawDb } from '../db'

export type GenreRow = {
  id: string
  name: string
  code: string
  description: string
  prompt: string
  thumbnail: string | null
  created_at: number
}

export type CategoryRow = {
  id: string
  name: string
  code: string
  created_at: number
}

export function getAllGenres(): GenreRow[] {
  const raw = getRawDb()
  return raw
    .prepare(
      'SELECT id, name, code, description, prompt, thumbnail, created_at FROM genres ORDER BY created_at DESC',
    )
    .all() as GenreRow[]
}

export function insertGenre(genre: GenreRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'INSERT INTO genres (id, name, code, description, prompt, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(genre.id, genre.name, genre.code, genre.description, genre.prompt, genre.thumbnail, genre.created_at)
}

export function updateGenre(genre: GenreRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'UPDATE genres SET name = ?, code = ?, description = ?, prompt = ?, thumbnail = ? WHERE id = ?',
    )
    .run(genre.name, genre.code, genre.description, genre.prompt, genre.thumbnail, genre.id)
}

export function deleteGenre(id: string): void {
  const raw = getRawDb()
  raw.prepare('DELETE FROM genres WHERE id = ?').run(id)
}

export function getAllCategories(): CategoryRow[] {
  const raw = getRawDb()
  return raw
    .prepare('SELECT id, name, code, created_at FROM genre_categories ORDER BY created_at DESC')
    .all() as CategoryRow[]
}

export function insertCategory(category: CategoryRow): void {
  const raw = getRawDb()
  raw
    .prepare('INSERT INTO genre_categories (id, name, code, created_at) VALUES (?, ?, ?, ?)')
    .run(category.id, category.name, category.code, category.created_at)
}

export function updateCategory(category: CategoryRow): void {
  const raw = getRawDb()
  raw.prepare('UPDATE genre_categories SET name = ?, code = ? WHERE id = ?').run(category.name, category.code, category.id)
}

export function deleteCategory(id: string): void {
  const raw = getRawDb()
  raw.prepare('DELETE FROM genre_categories WHERE id = ?').run(id)
}
