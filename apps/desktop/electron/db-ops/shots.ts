import { getRawDb } from '../db'
import { runInTransaction } from './tx'

export type ShotRow = {
  id: string
  series_id: string
  scene_id: string
  title: string
  shot_index: number
  shot_size: string
  camera_angle: string
  camera_move: string
  duration_sec: number
  action: string
  dialogue: string
  character_ids: string[]
  thumbnail: string | null
  created_at: number
}

type ShotSqlRow = Omit<ShotRow, 'character_ids'> & { character_ids: string }

export function ensureShotsSchema(): void {
  const raw = getRawDb()
  raw.exec(
    'CREATE TABLE IF NOT EXISTS shots (id text PRIMARY KEY NOT NULL, series_id text NOT NULL, scene_id text NOT NULL, title text NOT NULL DEFAULT \'\', shot_index integer NOT NULL DEFAULT 0, shot_size text NOT NULL DEFAULT \'\', camera_angle text NOT NULL DEFAULT \'\', camera_move text NOT NULL DEFAULT \'\', duration_sec integer NOT NULL DEFAULT 3, action text NOT NULL DEFAULT \'\', dialogue text NOT NULL DEFAULT \'\', character_ids text NOT NULL DEFAULT \'[]\', thumbnail text, created_at integer NOT NULL)',
  )
}

function parseCharacterIds(rawValue: string): string[] {
  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) return []
    return parsed.map((v) => (typeof v === 'string' ? v : '')).filter(Boolean)
  } catch {
    return []
  }
}

function fromSql(row: ShotSqlRow): ShotRow {
  return {
    ...row,
    character_ids: parseCharacterIds(row.character_ids),
  }
}

function toSqlCharacterIds(ids: string[]): string {
  return JSON.stringify(ids.filter(Boolean))
}

export function getAllShots(): ShotRow[] {
  const raw = getRawDb()
  const rows = raw
    .prepare(
      'SELECT id, series_id, scene_id, title, shot_index, shot_size, camera_angle, camera_move, duration_sec, action, dialogue, character_ids, thumbnail, created_at FROM shots ORDER BY created_at DESC',
    )
    .all() as ShotSqlRow[]
  return rows.map(fromSql)
}

export function getShotsBySeries(seriesId: string): ShotRow[] {
  const raw = getRawDb()
  const rows = raw
    .prepare(
      'SELECT id, series_id, scene_id, title, shot_index, shot_size, camera_angle, camera_move, duration_sec, action, dialogue, character_ids, thumbnail, created_at FROM shots WHERE series_id = ? ORDER BY shot_index ASC, created_at ASC',
    )
    .all(seriesId) as ShotSqlRow[]
  return rows.map(fromSql)
}

export function insertShot(shot: ShotRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'INSERT OR REPLACE INTO shots (id, series_id, scene_id, title, shot_index, shot_size, camera_angle, camera_move, duration_sec, action, dialogue, character_ids, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      shot.id,
      shot.series_id,
      shot.scene_id,
      shot.title,
      shot.shot_index,
      shot.shot_size,
      shot.camera_angle,
      shot.camera_move,
      shot.duration_sec,
      shot.action,
      shot.dialogue,
      toSqlCharacterIds(shot.character_ids),
      shot.thumbnail,
      shot.created_at,
    )
}

export function updateShot(shot: ShotRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'UPDATE shots SET scene_id = ?, title = ?, shot_index = ?, shot_size = ?, camera_angle = ?, camera_move = ?, duration_sec = ?, action = ?, dialogue = ?, character_ids = ?, thumbnail = ? WHERE id = ?',
    )
    .run(
      shot.scene_id,
      shot.title,
      shot.shot_index,
      shot.shot_size,
      shot.camera_angle,
      shot.camera_move,
      shot.duration_sec,
      shot.action,
      shot.dialogue,
      toSqlCharacterIds(shot.character_ids),
      shot.thumbnail,
      shot.id,
    )
}

export function replaceShotsBySeries(payload: { seriesId: string; shots: ShotRow[] }): void {
  runInTransaction((raw) => {
    raw.prepare('DELETE FROM shots WHERE series_id = ?').run(payload.seriesId)
    const insertStmt = raw.prepare(
      'INSERT INTO shots (id, series_id, scene_id, title, shot_index, shot_size, camera_angle, camera_move, duration_sec, action, dialogue, character_ids, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const shot of payload.shots) {
      insertStmt.run(
        shot.id,
        payload.seriesId,
        shot.scene_id,
        shot.title,
        shot.shot_index,
        shot.shot_size,
        shot.camera_angle,
        shot.camera_move,
        shot.duration_sec,
        shot.action,
        shot.dialogue,
        toSqlCharacterIds(shot.character_ids),
        shot.thumbnail,
        shot.created_at,
      )
    }
  })
}

export function deleteShot(id: string): void {
  const raw = getRawDb()
  raw.prepare('DELETE FROM shots WHERE id = ?').run(id)
}
