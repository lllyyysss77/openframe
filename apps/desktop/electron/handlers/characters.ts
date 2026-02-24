import { ipcMain } from 'electron'
import { getRawDb } from '../db'

type CharacterRow = {
  id: string
  project_id: string
  name: string
  gender: string
  age: string
  personality: string
  thumbnail: string | null
  appearance: string
  background: string
  created_at: number
}

function normalizeAge(value: string): CharacterRow['age'] {
  const raw = (value || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (raw === '幼年' || lower === 'child') return 'child'
  if (raw === '少年' || lower === 'youth' || lower === 'teen') return 'youth'
  if (raw === '青年' || lower === 'young_adult' || lower === 'young adult') return 'young_adult'
  if (raw === '成年' || lower === 'adult') return 'adult'
  if (raw === '中年' || lower === 'middle_aged' || lower === 'middle-aged') return 'middle_aged'
  if (raw === '老年' || lower === 'elder') return 'elder'
  return ''
}

function normalizeGender(value: string): CharacterRow['gender'] {
  const raw = (value || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (raw === '男' || lower === 'male') return 'male'
  if (raw === '女' || lower === 'female') return 'female'
  if (raw === '其他' || lower === 'other') return 'other'
  return ''
}

function normalizeCharacterRow(row: CharacterRow): CharacterRow {
  return {
    ...row,
    gender: normalizeGender(row.gender),
    age: normalizeAge(row.age),
  }
}

function ensureCharactersSchema() {
  const raw = getRawDb()
  raw.exec(
    'CREATE TABLE IF NOT EXISTS characters (id text PRIMARY KEY NOT NULL, project_id text NOT NULL, name text NOT NULL DEFAULT \'\', gender text NOT NULL DEFAULT \'\', age text NOT NULL DEFAULT \'\', personality text NOT NULL DEFAULT \'\', appearance text NOT NULL DEFAULT \'\', background text NOT NULL DEFAULT \'\', created_at integer NOT NULL)',
  )
  try {
    raw.exec('ALTER TABLE characters ADD COLUMN thumbnail text')
  } catch {
    // ignore when column already exists
  }

  const rows = raw
    .prepare('SELECT id, project_id, name, gender, age, personality, thumbnail, appearance, background, created_at FROM characters')
    .all() as CharacterRow[]
  const updateStmt = raw.prepare('UPDATE characters SET gender = ?, age = ? WHERE id = ?')
  for (const row of rows) {
    const next = normalizeCharacterRow(row)
    if (next.gender !== row.gender || next.age !== row.age) {
      updateStmt.run(next.gender, next.age, row.id)
    }
  }
}

export function registerCharactersHandlers() {
  ensureCharactersSchema()

  ipcMain.handle('characters:getAll', () => {
    const raw = getRawDb()
    const rows = raw
      .prepare(
        'SELECT id, project_id, name, gender, age, personality, thumbnail, appearance, background, created_at FROM characters ORDER BY created_at DESC',
      )
      .all() as CharacterRow[]
    return rows.map(normalizeCharacterRow)
  })

  ipcMain.handle('characters:getByProject', (_event, projectId: string) => {
    const raw = getRawDb()
    const rows = raw
      .prepare(
        'SELECT id, project_id, name, gender, age, personality, thumbnail, appearance, background, created_at FROM characters WHERE project_id = ? ORDER BY created_at ASC',
      )
      .all(projectId) as CharacterRow[]
    return rows.map(normalizeCharacterRow)
  })

  ipcMain.handle('characters:insert', (_event, character: CharacterRow) => {
    const raw = getRawDb()
    const next = normalizeCharacterRow(character)
    raw
      .prepare(
        'INSERT OR REPLACE INTO characters (id, project_id, name, gender, age, personality, thumbnail, appearance, background, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        next.id,
        next.project_id,
        next.name,
        next.gender,
        next.age,
        next.personality,
        next.thumbnail,
        next.appearance,
        next.background,
        next.created_at,
      )
  })

  ipcMain.handle('characters:update', (_event, character: CharacterRow) => {
    const raw = getRawDb()
    const next = normalizeCharacterRow(character)
    raw
      .prepare(
        'UPDATE characters SET name = ?, gender = ?, age = ?, personality = ?, thumbnail = ?, appearance = ?, background = ? WHERE id = ?',
      )
      .run(
        next.name,
        next.gender,
        next.age,
        next.personality,
        next.thumbnail,
        next.appearance,
        next.background,
        next.id,
      )
  })

  ipcMain.handle('characters:replaceByProject', (_event, payload: { projectId: string; characters: CharacterRow[] }) => {
    const raw = getRawDb()
    raw.prepare('DELETE FROM characters WHERE project_id = ?').run(payload.projectId)
    const insertStmt = raw.prepare(
      'INSERT INTO characters (id, project_id, name, gender, age, personality, thumbnail, appearance, background, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const character of payload.characters) {
      const next = normalizeCharacterRow(character)
      insertStmt.run(
        next.id,
        payload.projectId,
        next.name,
        next.gender,
        next.age,
        next.personality,
        next.thumbnail,
        next.appearance,
        next.background,
        next.created_at,
      )
    }
  })

  ipcMain.handle('characters:delete', (_event, id: string) => {
    const raw = getRawDb()
    raw.prepare('DELETE FROM characters WHERE id = ?').run(id)
  })
}
