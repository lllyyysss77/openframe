import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@openframe/db'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DB_DIR = path.join(os.homedir(), '.openframe')
const DB_PATH = path.join(DB_DIR, 'app.db')

// 打包后 migrations 放在 extraResources/migrations；开发时从源目录读取
const MIGRATIONS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'migrations')
  : path.join(__dirname, '..', 'electron', 'migrations')

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sqlite: InstanceType<typeof Database> | null = null

export function getDb() {
  if (!_db) {
    fs.mkdirSync(DB_DIR, { recursive: true })
    _sqlite = new Database(DB_PATH)
    _sqlite.pragma('journal_mode = WAL')
    _db = drizzle(_sqlite, { schema })
    migrate(_db, { migrationsFolder: MIGRATIONS_DIR })
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
