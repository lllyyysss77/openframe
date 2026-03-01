import { ipcMain } from 'electron'
import {
  deleteCostume,
  ensureCostumesSchema,
  getAllCostumes,
  getCostumesByProject,
  getCostumesBySeries,
  insertCostume,
  linkCostumeToSeries,
  replaceCostumesByProject,
  replaceCostumesBySeries,
  type CostumeRow,
  type CostumeSeriesLink,
  unlinkCostumeFromSeries,
  updateCostume,
} from '../costumes'

export function registerCostumesHandlers() {
  ensureCostumesSchema()

  ipcMain.handle('costumes:getAll', () => getAllCostumes())
  ipcMain.handle('costumes:getByProject', (_event, projectId: string) => getCostumesByProject(projectId))
  ipcMain.handle('costumes:getBySeries', (_event, seriesId: string) => getCostumesBySeries(seriesId))
  ipcMain.handle('costumes:insert', (_event, costume: CostumeRow) => insertCostume(costume))
  ipcMain.handle('costumes:update', (_event, costume: CostumeRow) => updateCostume(costume))
  ipcMain.handle(
    'costumes:replaceByProject',
    (_event, payload: { projectId: string; costumes: CostumeRow[] }) => replaceCostumesByProject(payload),
  )
  ipcMain.handle(
    'costumes:replaceBySeries',
    (_event, payload: { projectId: string; seriesId: string; costumes: CostumeRow[] }) => replaceCostumesBySeries(payload),
  )
  ipcMain.handle('costumes:linkToSeries', (_event, payload: CostumeSeriesLink) => linkCostumeToSeries(payload))
  ipcMain.handle(
    'costumes:unlinkFromSeries',
    (_event, payload: { seriesId: string; costumeId: string }) => unlinkCostumeFromSeries(payload),
  )
  ipcMain.handle('costumes:delete', (_event, id: string) => deleteCostume(id))
}
