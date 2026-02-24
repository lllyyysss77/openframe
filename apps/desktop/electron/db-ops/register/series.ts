import { ipcMain } from 'electron'
import {
  deleteSeries,
  getAllSeries,
  getSeriesByProject,
  insertSeries,
  type SeriesRow,
  updateSeries,
} from '../series'

export function registerSeriesHandlers() {
  ipcMain.handle('series:getAll', () => getAllSeries())
  ipcMain.handle('series:getByProject', (_event, projectId: string) => getSeriesByProject(projectId))
  ipcMain.handle('series:insert', (_event, series: SeriesRow) => insertSeries(series))
  ipcMain.handle('series:update', (_event, series: SeriesRow) => updateSeries(series))
  ipcMain.handle('series:delete', (_event, id: string) => deleteSeries(id))
}
