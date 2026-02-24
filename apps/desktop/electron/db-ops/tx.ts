import { getRawDb } from '../db'

type RawDb = ReturnType<typeof getRawDb>

export function runInTransaction<T>(runner: (raw: RawDb) => T): T {
  const raw = getRawDb()
  const tx = raw.transaction((db: RawDb) => runner(db))
  return tx(raw)
}
