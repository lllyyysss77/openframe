import { ipcMain } from 'electron'
import {
  deleteShot,
  ensureShotsSchema,
  getAllShots,
  getShotsBySeries,
  insertShot,
  replaceShotsBySeries,
  type ShotRow,
  updateShot,
} from '../shots'

export function registerShotsHandlers() {
  ensureShotsSchema()

  ipcMain.handle('shots:getAll', () => getAllShots())
  ipcMain.handle('shots:getBySeries', (_event, seriesId: string) => getShotsBySeries(seriesId))
  ipcMain.handle('shots:insert', (_event, shot: ShotRow) => insertShot(shot))
  ipcMain.handle('shots:update', (_event, shot: ShotRow) => updateShot(shot))
  ipcMain.handle('shots:replaceBySeries', (_event, payload: { seriesId: string; shots: ShotRow[] }) => replaceShotsBySeries(payload))
  ipcMain.handle('shots:delete', (_event, id: string) => deleteShot(id))
}
