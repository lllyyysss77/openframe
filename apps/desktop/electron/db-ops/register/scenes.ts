import { ipcMain } from 'electron'
import {
  deleteScene,
  ensureScenesSchema,
  getAllScenes,
  getScenesBySeries,
  insertScene,
  replaceScenesBySeries,
  type SceneRow,
  updateScene,
} from '../scenes'

export function registerScenesHandlers() {
  ensureScenesSchema()

  ipcMain.handle('scenes:getAll', () => getAllScenes())
  ipcMain.handle('scenes:getBySeries', (_event, seriesId: string) => getScenesBySeries(seriesId))
  ipcMain.handle('scenes:insert', (_event, scene: SceneRow) => insertScene(scene))
  ipcMain.handle('scenes:update', (_event, scene: SceneRow) => updateScene(scene))
  ipcMain.handle('scenes:replaceBySeries', (_event, payload: { seriesId: string; scenes: SceneRow[] }) => replaceScenesBySeries(payload))
  ipcMain.handle('scenes:delete', (_event, id: string) => deleteScene(id))
}
