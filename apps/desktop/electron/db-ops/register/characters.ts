import { ipcMain } from 'electron'
import {
  deleteCharacter,
  ensureCharactersSchema,
  getAllCharacters,
  getCharactersByProject,
  getCharactersBySeries,
  insertCharacter,
  linkCharacterToSeries,
  replaceCharactersByProject,
  replaceCharactersBySeries,
  type CharacterRow,
  type CharacterSeriesLink,
  unlinkCharacterFromSeries,
  updateCharacter,
} from '../characters'

export function registerCharactersHandlers() {
  ensureCharactersSchema()

  ipcMain.handle('characters:getAll', () => getAllCharacters())
  ipcMain.handle('characters:getByProject', (_event, projectId: string) => getCharactersByProject(projectId))
  ipcMain.handle('characters:getBySeries', (_event, seriesId: string) => getCharactersBySeries(seriesId))
  ipcMain.handle('characters:insert', (_event, character: CharacterRow) => insertCharacter(character))
  ipcMain.handle('characters:update', (_event, character: CharacterRow) => updateCharacter(character))
  ipcMain.handle('characters:replaceByProject', (_event, payload: { projectId: string; characters: CharacterRow[] }) => replaceCharactersByProject(payload))
  ipcMain.handle(
    'characters:replaceBySeries',
    (_event, payload: { projectId: string; seriesId: string; characters: CharacterRow[] }) => replaceCharactersBySeries(payload),
  )
  ipcMain.handle('characters:linkToSeries', (_event, payload: CharacterSeriesLink) => linkCharacterToSeries(payload))
  ipcMain.handle(
    'characters:unlinkFromSeries',
    (_event, payload: { seriesId: string; characterId: string }) => unlinkCharacterFromSeries(payload),
  )
  ipcMain.handle('characters:delete', (_event, id: string) => deleteCharacter(id))
}
