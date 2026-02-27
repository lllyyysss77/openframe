import { ipcMain } from 'electron'
import {
  deleteProp,
  ensurePropsSchema,
  getAllProps,
  getPropsByProject,
  getPropsBySeries,
  insertProp,
  linkPropToSeries,
  replacePropsByProject,
  replacePropsBySeries,
  type PropRow,
  type PropSeriesLink,
  unlinkPropFromSeries,
  updateProp,
} from '../props'

export function registerPropsHandlers() {
  ensurePropsSchema()

  ipcMain.handle('props:getAll', () => getAllProps())
  ipcMain.handle('props:getByProject', (_event, projectId: string) => getPropsByProject(projectId))
  ipcMain.handle('props:getBySeries', (_event, seriesId: string) => getPropsBySeries(seriesId))
  ipcMain.handle('props:insert', (_event, prop: PropRow) => insertProp(prop))
  ipcMain.handle('props:update', (_event, prop: PropRow) => updateProp(prop))
  ipcMain.handle('props:replaceByProject', (_event, payload: { projectId: string; props: PropRow[] }) => replacePropsByProject(payload))
  ipcMain.handle(
    'props:replaceBySeries',
    (_event, payload: { projectId: string; seriesId: string; props: PropRow[] }) => replacePropsBySeries(payload),
  )
  ipcMain.handle('props:linkToSeries', (_event, payload: PropSeriesLink) => linkPropToSeries(payload))
  ipcMain.handle(
    'props:unlinkFromSeries',
    (_event, payload: { seriesId: string; propId: string }) => unlinkPropFromSeries(payload),
  )
  ipcMain.handle('props:delete', (_event, id: string) => deleteProp(id))
}
