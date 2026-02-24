import { ipcMain } from 'electron'
import { getRawDb } from '../db'

type ProjectRow = {
  id: string
  name: string
  video_ratio: '16:9' | '9:16'
  thumbnail: string | null
  category: string
  genre: string
  series_count: number
  created_at: number
}

export function registerProjectsHandlers() {
  ipcMain.handle('projects:getAll', () => {
    const raw = getRawDb()
    return raw
      .prepare(
        'SELECT id, name, video_ratio, thumbnail, category, genre, series_count, created_at FROM projects ORDER BY created_at DESC',
      )
      .all() as ProjectRow[]
  })

  ipcMain.handle('projects:insert', (_event, project: ProjectRow) => {
    const raw = getRawDb()
    raw
      .prepare(
        'INSERT INTO projects (id, name, video_ratio, thumbnail, category, genre, series_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        project.id,
        project.name,
        project.video_ratio,
        project.thumbnail,
        project.category,
        project.genre,
        project.series_count,
        project.created_at,
      )
  })

  ipcMain.handle('projects:update', (_event, project: ProjectRow) => {
    const raw = getRawDb()
    raw
      .prepare(
        'UPDATE projects SET name = ?, video_ratio = ?, thumbnail = ?, category = ?, genre = ?, series_count = ? WHERE id = ?',
      )
      .run(
        project.name,
        project.video_ratio,
        project.thumbnail,
        project.category,
        project.genre,
        project.series_count,
        project.id,
      )
  })

  ipcMain.handle('projects:delete', (_event, id: string) => {
    const raw = getRawDb()
    raw.prepare('DELETE FROM series WHERE project_id = ?').run(id)
    raw.prepare('DELETE FROM projects WHERE id = ?').run(id)
  })
}
