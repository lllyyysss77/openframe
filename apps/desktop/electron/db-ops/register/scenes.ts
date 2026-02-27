import { ipcMain } from 'electron'
import {
  deleteScene,
  ensureScenesSchema,
  getAllScenes,
  getScenesByProject,
  getScenesBySeries,
  insertScene,
  linkSceneToSeries,
  replaceScenesByProject,
  replaceScenesBySeries,
  type SceneRow,
  type SceneSeriesLink,
  unlinkSceneFromSeries,
  updateScene,
} from '../scenes'

export function registerScenesHandlers() {
  ensureScenesSchema()

  ipcMain.handle('scenes:getAll', () => getAllScenes())
  ipcMain.handle('scenes:getByProject', (_event, projectId: string) => getScenesByProject(projectId))
  ipcMain.handle('scenes:getBySeries', (_event, seriesId: string) => getScenesBySeries(seriesId))
  ipcMain.handle('scenes:insert', (_event, scene: SceneRow) => insertScene(scene))
  ipcMain.handle('scenes:update', (_event, scene: SceneRow) => updateScene(scene))
  ipcMain.handle(
    'scenes:replaceByProject',
    (_event, payload: { projectId: string; scenes: SceneRow[] }) => replaceScenesByProject(payload),
  )
  ipcMain.handle(
    'scenes:replaceBySeries',
    (_event, payload: { projectId: string; seriesId: string; scenes: SceneRow[] }) => replaceScenesBySeries(payload),
  )
  ipcMain.handle('scenes:linkToSeries', (_event, payload: SceneSeriesLink) => linkSceneToSeries(payload))
  ipcMain.handle(
    'scenes:unlinkFromSeries',
    (_event, payload: { seriesId: string; sceneId: string }) => unlinkSceneFromSeries(payload),
  )
  ipcMain.handle('scenes:delete', (_event, id: string) => deleteScene(id))
}
