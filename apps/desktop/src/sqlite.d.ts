interface SqliteAPI {
  /** 执行 INSERT / UPDATE / DELETE，返回影响行数和最后插入的 rowid */
  query(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>
  /** 执行 SELECT，返回所有行 */
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
}

interface SettingsAPI {
  getAll(): Promise<Array<{ key: string; value: string }>>
  upsert(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

declare global {
  interface Window {
    sqlite: SqliteAPI
    settingsAPI: SettingsAPI
  }
}

export {}
