import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@openframe/db'
import { store } from './store'
import { getDataDir } from './data_dir'
import { AI_PROVIDERS } from '@openframe/providers'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const sqliteVec = require('sqlite-vec') as { load: (db: unknown) => void }

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 打包后 migrations 放在 extraResources/migrations；开发时从源目录读取
const MIGRATIONS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'migrations')
  : path.join(__dirname, '..', 'electron', 'migrations')

const SHOTS_PRODUCTION_COLUMNS_MIGRATION_MILLIS = 1771982985060

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sqlite: InstanceType<typeof Database> | null = null

function isShotsProductionColumnsMigrationConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('production_first_frame')
    && message.includes('ALTER TABLE')
    && message.includes('shots')
  )
}

function ensureShotsProductionColumns(raw: InstanceType<typeof Database>): void {
  const tableExists = raw
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get('shots')
  if (!tableExists) return

  const columns = raw.prepare("PRAGMA table_info('shots')").all() as Array<{ name: string }>
  const names = new Set(columns.map((column) => column.name))

  if (!names.has('production_first_frame')) {
    raw.exec('ALTER TABLE shots ADD COLUMN production_first_frame text')
  }
  if (!names.has('production_last_frame')) {
    raw.exec('ALTER TABLE shots ADD COLUMN production_last_frame text')
  }
  if (!names.has('production_video')) {
    raw.exec('ALTER TABLE shots ADD COLUMN production_video text')
  }
}

function markMigrationApplied(raw: InstanceType<typeof Database>, createdAt: number): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `)

  const existing = raw
    .prepare('SELECT 1 FROM "__drizzle_migrations" WHERE created_at = ? LIMIT 1')
    .get(createdAt)
  if (!existing) {
    raw
      .prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES(?, ?)')
      .run('manual_hotfix_0009_shots_production_columns', createdAt)
  }
}

function recoverShotsMigrationConflict(raw: InstanceType<typeof Database>): void {
  ensureShotsProductionColumns(raw)
  markMigrationApplied(raw, SHOTS_PRODUCTION_COLUMNS_MIGRATION_MILLIS)
}

export function getDb() {
  if (!_db) {
    const DB_DIR = getDataDir()
    const DB_PATH = path.join(DB_DIR, 'app.db')
    fs.mkdirSync(DB_DIR, { recursive: true })
    _sqlite = new Database(DB_PATH)
    _sqlite.pragma('journal_mode = WAL')
    sqliteVec.load(_sqlite)
    _db = drizzle(_sqlite, { schema })

    try {
      migrate(_db, { migrationsFolder: MIGRATIONS_DIR })
    } catch (error) {
      if (!isShotsProductionColumnsMigrationConflict(error)) {
        throw error
      }

      recoverShotsMigrationConflict(_sqlite)
      migrate(_db, { migrationsFolder: MIGRATIONS_DIR })
    }

    // Determine embedding dimension from configured model
    const cfg = store.get('ai_config')
    const embeddingKey = cfg.models.embedding
    let dimension = 1024  // sensible default
    if (embeddingKey) {
      const [providerId, modelId] = embeddingKey.split(':')
      const provider = AI_PROVIDERS.find((p) => p.id === providerId)
      const model = provider?.models.find((m) => m.id === modelId)
      if (model?.dimension) dimension = model.dimension
    }

    // Recreate vec_chunks if dimension changed
    const storedDim = store.get('vec_dimension') as number
    if (storedDim !== dimension) {
      _sqlite.exec('DROP TABLE IF EXISTS vec_chunks')
      store.set('vec_dimension', dimension)
    }

    _sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding FLOAT[${dimension}]
      )
    `)
  }
  return _db
}

export function getRawDb() {
  getDb()
  return _sqlite!
}

export function closeDb() {
  _sqlite?.close()
  _db = null
  _sqlite = null
}
