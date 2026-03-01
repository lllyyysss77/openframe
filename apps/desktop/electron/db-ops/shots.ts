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
  prop_ids: string[]
  costume_ids: string[]
  thumbnail: string | null
  production_first_frame: string | null
  production_last_frame: string | null
  production_video: string | null
  production_first_frame_prompt_override: string | null
  production_last_frame_prompt_override: string | null
  production_video_prompt_override: string | null
  created_at: number
}

type ShotSqlRow = Omit<ShotRow, 'character_ids' | 'prop_ids' | 'costume_ids'> & { character_ids: string; prop_ids: string; costume_ids: string }

export function ensureShotsSchema(): void {
  const raw = getRawDb()
  raw.exec(
    'CREATE TABLE IF NOT EXISTS shots (id text PRIMARY KEY NOT NULL, series_id text NOT NULL, scene_id text NOT NULL, title text NOT NULL DEFAULT \'\', shot_index integer NOT NULL DEFAULT 0, shot_size text NOT NULL DEFAULT \'\', camera_angle text NOT NULL DEFAULT \'\', camera_move text NOT NULL DEFAULT \'\', duration_sec integer NOT NULL DEFAULT 3, action text NOT NULL DEFAULT \'\', dialogue text NOT NULL DEFAULT \'\', character_ids text NOT NULL DEFAULT \'[]\', prop_ids text NOT NULL DEFAULT \'[]\', costume_ids text NOT NULL DEFAULT \'[]\', thumbnail text, production_first_frame text, production_last_frame text, production_video text, production_first_frame_prompt_override text, production_last_frame_prompt_override text, production_video_prompt_override text, created_at integer NOT NULL)',
  )
  try {
    raw.exec('ALTER TABLE shots ADD COLUMN production_first_frame text')
  } catch {
    // ignore when column already exists
  }
  try {
    raw.exec('ALTER TABLE shots ADD COLUMN production_last_frame text')
  } catch {
    // ignore when column already exists
  }
  try {
    raw.exec('ALTER TABLE shots ADD COLUMN production_video text')
  } catch {
    // ignore when column already exists
  }
  try {
    raw.exec('ALTER TABLE shots ADD COLUMN production_first_frame_prompt_override text')
  } catch {
    // ignore when column already exists
  }
  try {
    raw.exec('ALTER TABLE shots ADD COLUMN production_last_frame_prompt_override text')
  } catch {
    // ignore when column already exists
  }
  try {
    raw.exec('ALTER TABLE shots ADD COLUMN production_video_prompt_override text')
  } catch {
    // ignore when column already exists
  }
  try {
    raw.exec("ALTER TABLE shots ADD COLUMN prop_ids text NOT NULL DEFAULT '[]'")
  } catch {
    // ignore when column already exists
  }
  try {
    raw.exec("ALTER TABLE shots ADD COLUMN costume_ids text NOT NULL DEFAULT '[]'")
  } catch {
    // ignore when column already exists
  }
}

function parseIds(rawValue: string): string[] {
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
    character_ids: parseIds(row.character_ids),
    prop_ids: parseIds(row.prop_ids),
    costume_ids: parseIds(row.costume_ids),
  }
}

function toSqlIds(ids: string[]): string {
  return JSON.stringify(ids.filter(Boolean))
}

export function getAllShots(): ShotRow[] {
  const raw = getRawDb()
  const rows = raw
    .prepare(
      'SELECT id, series_id, scene_id, title, shot_index, shot_size, camera_angle, camera_move, duration_sec, action, dialogue, character_ids, prop_ids, costume_ids, thumbnail, production_first_frame, production_last_frame, production_video, production_first_frame_prompt_override, production_last_frame_prompt_override, production_video_prompt_override, created_at FROM shots ORDER BY created_at DESC',
    )
    .all() as ShotSqlRow[]
  return rows.map(fromSql)
}

export function getShotsBySeries(seriesId: string): ShotRow[] {
  const raw = getRawDb()
  const rows = raw
    .prepare(
      'SELECT id, series_id, scene_id, title, shot_index, shot_size, camera_angle, camera_move, duration_sec, action, dialogue, character_ids, prop_ids, costume_ids, thumbnail, production_first_frame, production_last_frame, production_video, production_first_frame_prompt_override, production_last_frame_prompt_override, production_video_prompt_override, created_at FROM shots WHERE series_id = ? ORDER BY shot_index ASC, created_at ASC',
    )
    .all(seriesId) as ShotSqlRow[]
  return rows.map(fromSql)
}

export function insertShot(shot: ShotRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'INSERT OR REPLACE INTO shots (id, series_id, scene_id, title, shot_index, shot_size, camera_angle, camera_move, duration_sec, action, dialogue, character_ids, prop_ids, costume_ids, thumbnail, production_first_frame, production_last_frame, production_video, production_first_frame_prompt_override, production_last_frame_prompt_override, production_video_prompt_override, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      toSqlIds(shot.character_ids),
      toSqlIds(shot.prop_ids),
      toSqlIds(shot.costume_ids),
      shot.thumbnail,
      shot.production_first_frame,
      shot.production_last_frame,
      shot.production_video,
      shot.production_first_frame_prompt_override,
      shot.production_last_frame_prompt_override,
      shot.production_video_prompt_override,
      shot.created_at,
    )
}

export function updateShot(shot: ShotRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'UPDATE shots SET scene_id = ?, title = ?, shot_index = ?, shot_size = ?, camera_angle = ?, camera_move = ?, duration_sec = ?, action = ?, dialogue = ?, character_ids = ?, prop_ids = ?, costume_ids = ?, thumbnail = ?, production_first_frame = ?, production_last_frame = ?, production_video = ?, production_first_frame_prompt_override = ?, production_last_frame_prompt_override = ?, production_video_prompt_override = ? WHERE id = ?',
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
      toSqlIds(shot.character_ids),
      toSqlIds(shot.prop_ids),
      toSqlIds(shot.costume_ids),
      shot.thumbnail,
      shot.production_first_frame,
      shot.production_last_frame,
      shot.production_video,
      shot.production_first_frame_prompt_override,
      shot.production_last_frame_prompt_override,
      shot.production_video_prompt_override,
      shot.id,
    )
}

export function replaceShotsBySeries(payload: { seriesId: string; shots: ShotRow[] }): void {
  runInTransaction((raw) => {
    raw.prepare('DELETE FROM shots WHERE series_id = ?').run(payload.seriesId)
    const insertStmt = raw.prepare(
      'INSERT INTO shots (id, series_id, scene_id, title, shot_index, shot_size, camera_angle, camera_move, duration_sec, action, dialogue, character_ids, prop_ids, costume_ids, thumbnail, production_first_frame, production_last_frame, production_video, production_first_frame_prompt_override, production_last_frame_prompt_override, production_video_prompt_override, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
        toSqlIds(shot.character_ids),
        toSqlIds(shot.prop_ids),
        toSqlIds(shot.costume_ids),
        shot.thumbnail,
        shot.production_first_frame,
        shot.production_last_frame,
        shot.production_video,
        shot.production_first_frame_prompt_override,
        shot.production_last_frame_prompt_override,
        shot.production_video_prompt_override,
        shot.created_at,
      )
    }

    const projectRow = raw
      .prepare('SELECT project_id FROM series WHERE id = ?')
      .get(payload.seriesId) as { project_id: string } | undefined
    const projectId = projectRow?.project_id
    if (projectId) {
      const now = Date.now()
      const sceneLinkStmt = raw.prepare(
        'INSERT OR IGNORE INTO series_scene_links (project_id, series_id, scene_id, created_at) VALUES (?, ?, ?, ?)',
      )
      const characterLinkStmt = raw.prepare(
        'INSERT OR IGNORE INTO series_character_links (project_id, series_id, character_id, created_at) VALUES (?, ?, ?, ?)',
      )
      const propLinkStmt = raw.prepare(
        'INSERT OR IGNORE INTO series_prop_links (project_id, series_id, prop_id, created_at) VALUES (?, ?, ?, ?)',
      )
      const costumeLinkStmt = raw.prepare(
        'INSERT OR IGNORE INTO series_costume_links (project_id, series_id, costume_id, created_at) VALUES (?, ?, ?, ?)',
      )

      for (const shot of payload.shots) {
        sceneLinkStmt.run(projectId, payload.seriesId, shot.scene_id, now)
        for (const characterId of shot.character_ids) {
          characterLinkStmt.run(projectId, payload.seriesId, characterId, now)
        }
        for (const propId of shot.prop_ids) {
          propLinkStmt.run(projectId, payload.seriesId, propId, now)
        }
        for (const costumeId of shot.costume_ids) {
          costumeLinkStmt.run(projectId, payload.seriesId, costumeId, now)
        }
      }
    }
  })
}

export function deleteShot(id: string): void {
  const raw = getRawDb()
  raw.prepare('DELETE FROM shots WHERE id = ?').run(id)
}
