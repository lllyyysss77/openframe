import { getRawDb } from '../db'
import { runInTransaction } from './tx'

export type SceneRow = {
  id: string
  series_id: string
  title: string
  location: string
  time: string
  mood: string
  description: string
  shot_notes: string
  thumbnail: string | null
  created_at: number
}

export function ensureScenesSchema(): void {
  const raw = getRawDb()
  raw.exec(
    'CREATE TABLE IF NOT EXISTS scenes (id text PRIMARY KEY NOT NULL, series_id text NOT NULL, title text NOT NULL DEFAULT \'\', location text NOT NULL DEFAULT \'\', time text NOT NULL DEFAULT \'\', mood text NOT NULL DEFAULT \'\', description text NOT NULL DEFAULT \'\', shot_notes text NOT NULL DEFAULT \'\', thumbnail text, created_at integer NOT NULL)',
  )
}

export function getAllScenes(): SceneRow[] {
  const raw = getRawDb()
  return raw
    .prepare(
      'SELECT id, series_id, title, location, time, mood, description, shot_notes, thumbnail, created_at FROM scenes ORDER BY created_at DESC',
    )
    .all() as SceneRow[]
}

export function getScenesBySeries(seriesId: string): SceneRow[] {
  const raw = getRawDb()
  return raw
    .prepare(
      'SELECT id, series_id, title, location, time, mood, description, shot_notes, thumbnail, created_at FROM scenes WHERE series_id = ? ORDER BY created_at ASC',
    )
    .all(seriesId) as SceneRow[]
}

export function insertScene(scene: SceneRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'INSERT OR REPLACE INTO scenes (id, series_id, title, location, time, mood, description, shot_notes, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      scene.id,
      scene.series_id,
      scene.title,
      scene.location,
      scene.time,
      scene.mood,
      scene.description,
      scene.shot_notes,
      scene.thumbnail,
      scene.created_at,
    )
}

export function updateScene(scene: SceneRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'UPDATE scenes SET title = ?, location = ?, time = ?, mood = ?, description = ?, shot_notes = ?, thumbnail = ? WHERE id = ?',
    )
    .run(
      scene.title,
      scene.location,
      scene.time,
      scene.mood,
      scene.description,
      scene.shot_notes,
      scene.thumbnail,
      scene.id,
    )
}

export function replaceScenesBySeries(payload: { seriesId: string; scenes: SceneRow[] }): void {
  runInTransaction((raw) => {
    raw.prepare('DELETE FROM scenes WHERE series_id = ?').run(payload.seriesId)
    raw.prepare('DELETE FROM shots WHERE series_id = ?').run(payload.seriesId)
    const insertStmt = raw.prepare(
      'INSERT INTO scenes (id, series_id, title, location, time, mood, description, shot_notes, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const scene of payload.scenes) {
      insertStmt.run(
        scene.id,
        payload.seriesId,
        scene.title,
        scene.location,
        scene.time,
        scene.mood,
        scene.description,
        scene.shot_notes,
        scene.thumbnail,
        scene.created_at,
      )
    }
  })
}

export function deleteScene(id: string): void {
  runInTransaction((raw) => {
    raw.prepare('DELETE FROM shots WHERE scene_id = ?').run(id)
    raw.prepare('DELETE FROM scenes WHERE id = ?').run(id)
  })
}
