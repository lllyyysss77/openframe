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

type CountRow = { count: number }
type LinkStatsRow = { count: number; min_created_at: number | null; max_created_at: number | null }

export function syncProjectSeriesCount(projectId: string): void {
  const raw = getRawDb()
  const row = raw
    .prepare('SELECT COUNT(*) as count FROM series WHERE project_id = ?')
    .get(projectId) as { count: number }
  raw.prepare('UPDATE projects SET series_count = ? WHERE id = ?').run(row.count, projectId)
}

function getProjectResourceCount(raw: ReturnType<typeof getRawDb>, table: 'scenes' | 'characters' | 'props' | 'costumes', projectId: string): number {
  try {
    const row = raw
      .prepare(`SELECT COUNT(*) as count FROM ${table} WHERE project_id = ?`)
      .get(projectId) as CountRow
    return row.count
  } catch {
    return 0
  }
}

function getSeriesLinkStats(
  raw: ReturnType<typeof getRawDb>,
  table: 'series_scene_links' | 'series_character_links' | 'series_prop_links' | 'series_costume_links',
  seriesId: string,
): LinkStatsRow {
  try {
    return raw
      .prepare(`SELECT COUNT(*) as count, MIN(created_at) as min_created_at, MAX(created_at) as max_created_at FROM ${table} WHERE series_id = ?`)
      .get(seriesId) as LinkStatsRow
  } catch {
    return { count: 0, min_created_at: null, max_created_at: null }
  }
}

function getLegacyBatchStamp(totalCount: number, stats: LinkStatsRow): number | null | undefined {
  if (totalCount === 0) return null
  if (stats.count !== totalCount) return undefined
  if (stats.min_created_at == null || stats.max_created_at == null) return undefined
  if (stats.min_created_at !== stats.max_created_at) return undefined
  return stats.min_created_at
}

export function cleanupLegacyInheritedSeriesLinks(): void {
  runInTransaction((raw) => {
    const rows = raw
      .prepare('SELECT id, project_id, created_at FROM series')
      .all() as Array<{ id: string; project_id: string; created_at: number }>

    for (const row of rows) {
      const shotCount = (raw.prepare('SELECT COUNT(*) as count FROM shots WHERE series_id = ?').get(row.id) as CountRow).count
      if (shotCount > 0) continue

      const sceneCount = getProjectResourceCount(raw, 'scenes', row.project_id)
      const characterCount = getProjectResourceCount(raw, 'characters', row.project_id)
      const propCount = getProjectResourceCount(raw, 'props', row.project_id)
      const costumeCount = getProjectResourceCount(raw, 'costumes', row.project_id)

      const sceneStamp = getLegacyBatchStamp(
        sceneCount,
        getSeriesLinkStats(raw, 'series_scene_links', row.id),
      )
      const characterStamp = getLegacyBatchStamp(
        characterCount,
        getSeriesLinkStats(raw, 'series_character_links', row.id),
      )
      const propStamp = getLegacyBatchStamp(
        propCount,
        getSeriesLinkStats(raw, 'series_prop_links', row.id),
      )
      const costumeStamp = getLegacyBatchStamp(
        costumeCount,
        getSeriesLinkStats(raw, 'series_costume_links', row.id),
      )

      const stamps = [sceneStamp, characterStamp, propStamp, costumeStamp]
      if (stamps.every((stamp) => stamp == null)) continue
      if (stamps.some((stamp) => stamp === undefined)) continue

      const concreteStamps = stamps.filter((stamp): stamp is number => stamp != null)
      if (concreteStamps.length === 0) continue
      const sameBatch = concreteStamps.every((stamp) => stamp === concreteStamps[0])
      if (!sameBatch) continue

      const batchCreatedAt = concreteStamps[0]
      if (Math.abs(batchCreatedAt - row.created_at) > 60_000) continue

      raw.prepare('DELETE FROM series_scene_links WHERE series_id = ?').run(row.id)
      raw.prepare('DELETE FROM series_character_links WHERE series_id = ?').run(row.id)
      raw.prepare('DELETE FROM series_prop_links WHERE series_id = ?').run(row.id)
      raw.prepare('DELETE FROM series_costume_links WHERE series_id = ?').run(row.id)
    }
  })
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
  runInTransaction((raw) => {
    raw
      .prepare(
        'INSERT INTO series (id, project_id, title, script, sort_index, thumbnail, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(series.id, series.project_id, series.title, series.script, series.sort_index, series.thumbnail, series.duration, series.created_at)
  })
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
    raw.prepare('DELETE FROM shots WHERE series_id = ?').run(id)
    raw.prepare('DELETE FROM series_scene_links WHERE series_id = ?').run(id)
    raw.prepare('DELETE FROM series_character_links WHERE series_id = ?').run(id)
    raw.prepare('DELETE FROM series_prop_links WHERE series_id = ?').run(id)
    raw.prepare('DELETE FROM series_costume_links WHERE series_id = ?').run(id)
    raw.prepare('DELETE FROM series WHERE id = ?').run(id)
  })
  if (row?.project_id) syncProjectSeriesCount(row.project_id)
}
