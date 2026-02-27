import { getRawDb } from '../db'
import { runInTransaction } from './tx'

export type ProjectRow = {
  id: string
  name: string
  video_ratio: '16:9' | '9:16'
  thumbnail: string | null
  category: string
  genre: string
  series_count: number
  created_at: number
}

export function getAllProjects(): ProjectRow[] {
  const raw = getRawDb()
  return raw
    .prepare(
      'SELECT id, name, video_ratio, thumbnail, category, genre, series_count, created_at FROM projects ORDER BY created_at DESC',
    )
    .all() as ProjectRow[]
}

export function insertProject(project: ProjectRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'INSERT INTO projects (id, name, video_ratio, thumbnail, category, genre, series_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      project.id,
      project.name,
      project.video_ratio,
      project.thumbnail,
      project.category,
      project.genre,
      project.series_count,
      project.created_at,
    )
}

export function updateProject(project: ProjectRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'UPDATE projects SET name = ?, video_ratio = ?, thumbnail = ?, category = ?, genre = ?, series_count = ? WHERE id = ?',
    )
    .run(
      project.name,
      project.video_ratio,
      project.thumbnail,
      project.category,
      project.genre,
      project.series_count,
      project.id,
    )
}

export function deleteProject(id: string): void {
  runInTransaction((raw) => {
    raw.prepare('DELETE FROM series_scene_links WHERE project_id = ?').run(id)
    raw.prepare('DELETE FROM series_character_links WHERE project_id = ?').run(id)
    raw.prepare('DELETE FROM series_prop_links WHERE project_id = ?').run(id)
    raw.prepare('DELETE FROM characters WHERE project_id = ?').run(id)
    raw.prepare('DELETE FROM character_relations WHERE project_id = ?').run(id)
    raw.prepare('DELETE FROM props WHERE project_id = ?').run(id)
    raw.prepare('DELETE FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)').run(id)
    raw.prepare('DELETE FROM scenes WHERE project_id = ?').run(id)
    raw.prepare('DELETE FROM shots WHERE series_id IN (SELECT id FROM series WHERE project_id = ?)').run(id)
    raw.prepare('DELETE FROM series WHERE project_id = ?').run(id)
    raw.prepare('DELETE FROM projects WHERE id = ?').run(id)
  })
}
