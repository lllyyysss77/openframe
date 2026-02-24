import { getRawDb } from '../db'
import { runInTransaction } from './tx'

export type SeriesRow = {
  id: string
  project_id: string
  title: string
  script: string
  sort_index: number
  thumbnail: string | null
  duration: number
  created_at: number
}

export function syncProjectSeriesCount(projectId: string): void {
  const raw = getRawDb()
  const row = raw
    .prepare('SELECT COUNT(*) as count FROM series WHERE project_id = ?')
    .get(projectId) as { count: number }
  raw.prepare('UPDATE projects SET series_count = ? WHERE id = ?').run(row.count, projectId)
}

export function getAllSeries(): SeriesRow[] {
  const raw = getRawDb()
  return raw
    .prepare(
      'SELECT id, project_id, title, script, sort_index, thumbnail, duration, created_at FROM series ORDER BY created_at DESC',
    )
    .all() as SeriesRow[]
}

export function getSeriesByProject(projectId: string): SeriesRow[] {
  const raw = getRawDb()
  return raw
    .prepare(
      'SELECT id, project_id, title, script, sort_index, thumbnail, duration, created_at FROM series WHERE project_id = ? ORDER BY sort_index ASC, created_at ASC',
    )
    .all(projectId) as SeriesRow[]
}

export function insertSeries(series: SeriesRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'INSERT INTO series (id, project_id, title, script, sort_index, thumbnail, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(series.id, series.project_id, series.title, series.script, series.sort_index, series.thumbnail, series.duration, series.created_at)
  syncProjectSeriesCount(series.project_id)
}

export function updateSeries(series: SeriesRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'UPDATE series SET title = ?, script = ?, sort_index = ?, thumbnail = ?, duration = ? WHERE id = ?',
    )
    .run(series.title, series.script, series.sort_index, series.thumbnail, series.duration, series.id)
}

export function deleteSeries(id: string): void {
  const row = getRawDb().prepare('SELECT project_id FROM series WHERE id = ?').get(id) as { project_id: string } | undefined
  runInTransaction((raw) => {
    raw.prepare('DELETE FROM scenes WHERE series_id = ?').run(id)
    raw.prepare('DELETE FROM shots WHERE series_id = ?').run(id)
    raw.prepare('DELETE FROM series WHERE id = ?').run(id)
  })
  if (row?.project_id) syncProjectSeriesCount(row.project_id)
}
